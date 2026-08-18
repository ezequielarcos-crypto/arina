// En desarrollo (yarn tauri dev) el backend lo levanta `yarn dev`, así que el
// sidecar solo se lanza en el build de producción.
//
// El backend va como recurso (no como externalBin) porque el bundler de Tauri
// hace strip de los externalBin y eso destruye el payload embebido de pkg.
#[cfg(not(debug_assertions))]
mod backend {
    use std::process::{Child, Command, Stdio};
    use std::sync::Mutex;
    use tauri::Manager;

    pub struct Backend(pub Mutex<Option<Child>>);

    pub fn start(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
        let data_dir = app.path().app_data_dir()?;
        std::fs::create_dir_all(&data_dir)?;

        // Primer arranque: copiar la base vacía al directorio de datos del usuario
        let db_path = data_dir.join("arina.db");
        if !db_path.exists() {
            let template = app.path().resolve(
                "resources/arina-template.db",
                tauri::path::BaseDirectory::Resource,
            )?;
            std::fs::copy(&template, &db_path)?;
        }

        let resolve = |p: &str| app.path().resolve(p, tauri::path::BaseDirectory::Resource);
        let engine = resolve("resources/libquery_engine-debian-openssl-1.0.x.so.node")?;

        // El backend viaja gzip-eado (si fuera un ELF suelto, linuxdeploy lo
        // parchearía con patchelf y rompería el payload de pkg). Se descomprime
        // al directorio de datos en cada arranque, así una actualización de la
        // app siempre deja el backend al día.
        let server_gz = resolve("resources/arina-backend.gz")?;
        let server = data_dir.join("arina-backend");
        {
            let gz = std::fs::File::open(&server_gz)?;
            let mut decoder = flate2::read::GzDecoder::new(std::io::BufReader::new(gz));
            let mut out = std::fs::File::create(&server)?;
            std::io::copy(&mut decoder, &mut out)?;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&server, std::fs::Permissions::from_mode(0o755))?;
        }

        // Salida del backend a un log en el directorio de datos, para diagnóstico
        let log = std::fs::File::create(data_dir.join("backend.log"))?;

        let mut cmd = Command::new(&server);
        cmd.env("ARINA_DB", db_path.as_os_str())
            .env("PRISMA_QUERY_ENGINE_LIBRARY", engine.as_os_str())
            .env("PORT", "3210")
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log));

        // Si el proceso principal muere (aun con SIGKILL), el kernel termina al
        // backend: evita huérfanos escuchando en el puerto 3210.
        #[cfg(target_os = "linux")]
        {
            use std::os::unix::process::CommandExt;
            unsafe {
                cmd.pre_exec(|| {
                    libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                    Ok(())
                });
            }
        }

        let child = cmd.spawn()?;

        app.manage(Backend(Mutex::new(Some(child))));
        Ok(())
    }

    pub fn stop(app: &tauri::AppHandle) {
        if let Some(state) = app.try_state::<Backend>() {
            if let Some(mut child) = state.0.lock().unwrap().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(not(debug_assertions))]
    let builder = builder.setup(|app| {
        backend::start(app.handle())?;
        Ok(())
    });

    builder
        .build(tauri::generate_context!())
        .expect("error al iniciar la aplicación Tauri")
        .run(|_app, _event| {
            #[cfg(not(debug_assertions))]
            if let tauri::RunEvent::Exit = _event {
                backend::stop(_app);
            }
        });
}
