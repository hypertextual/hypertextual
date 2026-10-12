use clap::Parser;
use std::io::Write;

/// A minimal Clap-derived command-line interface.
#[derive(Parser)]
#[command(name = "hyped", version, about)]
struct Cli {}

/// Parse the given arguments and emit the greeting to `out`.
fn run(cli: Cli, mut out: impl Write) -> anyhow::Result<()> {
    let _ = cli;
    writeln!(out, "hello hyped!")?;
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    run(cli, std::io::stdout())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prints_the_exact_greeting() {
        let cli = Cli::parse_from(["hyped"]);
        let mut out = Vec::new();
        run(cli, &mut out).unwrap();
        assert_eq!(String::from_utf8(out).unwrap(), "hello hyped!\n");
    }
}
