use htmd_vault::blocks;
use std::{hint::black_box, time::Instant};

fn main() {
    println!(
        "Release-mode parser measurements; not UI latency. Microseconds, 200 samples after 20 warmups."
    );
    println!("blocks,bytes,parse_p50_us,parse_p95_us,join_p95_us");
    for count in [100, 1000, 5000] {
        let source =
            "A paragraph with **bold**, *emphasis*, and `code`. Café 🦀.\n\n".repeat(count);
        for _ in 0..20 {
            black_box(blocks(&source));
        }
        let mut parse = Vec::new();
        let mut join = Vec::new();
        for _ in 0..200 {
            let start = Instant::now();
            let nodes = black_box(blocks(black_box(&source)));
            parse.push(start.elapsed().as_secs_f64() * 1e6);
            let start = Instant::now();
            black_box(nodes.iter().map(|b| b.source.as_str()).collect::<String>());
            join.push(start.elapsed().as_secs_f64() * 1e6);
        }
        parse.sort_by(f64::total_cmp);
        join.sort_by(f64::total_cmp);
        println!(
            "{count},{},{:.1},{:.1},{:.1}",
            source.len(),
            parse[100],
            parse[190],
            join[190]
        );
    }
}
