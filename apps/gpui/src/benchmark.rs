//! Opt-in compositor-visible marker for the external native benchmark driver.
//! Disabled unless HTMD_BENCH=1. It measures no time inside the application.
use std::sync::{
    OnceLock,
    atomic::{AtomicU32, Ordering},
};
pub fn next() -> u32 {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    static SEQUENCE: AtomicU32 = AtomicU32::new(0);
    if *ENABLED.get_or_init(|| std::env::var("HTMD_BENCH").as_deref() == Ok("1")) {
        SEQUENCE.fetch_add(1, Ordering::Relaxed) + 1
    } else {
        0
    }
}
