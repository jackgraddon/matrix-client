use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // Apply patch to rsrpc submodule if it exists
    let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let patch_file = manifest_dir.join("..").join("rsrpc.patch");
    let rsrpc_dir = manifest_dir.join("rsrpc");

    if patch_file.exists() && rsrpc_dir.exists() {
        println!("cargo:warning=Applying rsrpc.patch...");
        let _ = std::process::Command::new("patch")
            .arg("-p1")
            .arg("--forward")
            .arg("-i")
            .arg(&patch_file)
            .current_dir(&rsrpc_dir)
            .status();
    }

    println!("cargo:rerun-if-changed=rsrpc/src");
    println!("cargo:rerun-if-changed=rsrpc/Cargo.toml");

    let target = env::var("TARGET").expect("TARGET not set by Cargo");
    let profile = env::var("PROFILE").expect("PROFILE not set by Cargo");
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let target_dir = manifest_dir.join("target");

    let binary_name = if target.contains("windows") { "rsrpc.exe" } else { "rsrpc" };

    // Cargo places the binary at target/<triple>/<profile>/ when built with
    // --target, or at target/<profile>/ when built without --target.
    // beforeDevCommand runs without --target so we check both.
    let candidate_with_triple = target_dir.join(&target).join(&profile).join(binary_name);
    let candidate_without_triple = target_dir.join(&profile).join(binary_name);

    let src_binary = if candidate_with_triple.exists() {
        candidate_with_triple
    } else if candidate_without_triple.exists() {
        candidate_without_triple
    } else {
        panic!(
            "rsrpc binary not found. Checked:\n  {}\n  {}\n\
             Make sure beforeDevCommand ran `cargo build -p rsrpc` from src-tauri/.",
            candidate_with_triple.display(),
            candidate_without_triple.display(),
        )
    };

    let binaries_dir = manifest_dir.join("binaries");
    fs::create_dir_all(&binaries_dir).expect("Failed to create src-tauri/binaries");

    let dest_binary = binaries_dir.join(if target.contains("windows") {
        format!("rsrpc-{}.exe", target)
    } else {
        format!("rsrpc-{}", target)
    });

    fs::copy(&src_binary, &dest_binary).unwrap_or_else(|e| {
        panic!(
            "Failed to copy rsrpc binary\n  from: {}\n  to:   {}\n  err:  {}",
            src_binary.display(),
            dest_binary.display(),
            e
        )
    });

    println!("cargo:warning=rsrpc sidecar -> {}", dest_binary.display());

    tauri_build::build()
}