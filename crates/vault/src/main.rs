//! Small stdio adapter used by browser tests: exercises the real vault and parser.
use anyhow::{Result, bail};
use htmd_vault::{Vault, blocks};
use serde::Deserialize;
use std::io::{self, Read};

#[derive(Deserialize)]
struct SaveRequest {
    expected: String,
    source: String,
}

fn main() -> Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let read = || -> Result<String> {
        let mut source = String::new();
        io::stdin().read_to_string(&mut source)?;
        Ok(source)
    };
    let result = match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["tree", root] => serde_json::to_value(Vault::new(root)?.tree()?)?,
        ["open", root, path] => serde_json::to_value(Vault::new(root)?.open(path)?)?,
        ["parse"] => serde_json::to_value(blocks(&read()?))?,
        ["save", root, path] => {
            let request: SaveRequest = serde_json::from_str(&read()?)?;
            Vault::new(root)?.save(path, &request.expected, &request.source)?;
            serde_json::Value::Null
        }
        _ => bail!(
            "Usage: htmd-vault tree ROOT | open ROOT PATH | parse < source | save ROOT PATH < JSON"
        ),
    };
    println!("{result}");
    Ok(())
}
