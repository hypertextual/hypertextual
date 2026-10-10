//! Experimental HTMD v1 custom node: a data-only `htmd:chart` fenced block.
use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ChartSpec {
    pub version: u8,
    #[serde(rename = "type")]
    pub kind: ChartKind,
    pub title: String,
    pub labels: Vec<String>,
    pub series: Vec<ChartSeries>,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ChartKind {
    Bar,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ChartSeries {
    pub name: String,
    pub values: Vec<f64>,
}

impl ChartSpec {
    pub fn parse(source: &str) -> Result<Self> {
        let spec: Self = serde_json::from_str(source)?;
        ensure!(spec.version == 1, "Unsupported chart version; expected 1");
        ensure!(
            !spec.title.is_empty() && spec.title.chars().count() <= 160,
            "Chart title must contain 1–160 characters"
        );
        ensure!(
            (1..=24).contains(&spec.labels.len()),
            "Chart must contain 1–24 labels"
        );
        ensure!(
            spec.labels
                .iter()
                .all(|label| !label.is_empty() && label.chars().count() <= 80),
            "Labels must contain 1–80 characters"
        );
        ensure!(
            (1..=5).contains(&spec.series.len()),
            "Chart must contain 1–5 series"
        );
        for series in &spec.series {
            ensure!(
                !series.name.is_empty() && series.name.chars().count() <= 80,
                "Series names must contain 1–80 characters"
            );
            ensure!(
                series.values.len() == spec.labels.len(),
                "Each series needs one value per label"
            );
            ensure!(
                series
                    .values
                    .iter()
                    .all(|value| value.is_finite() && *value >= 0.),
                "Chart values must be finite and nonnegative"
            );
        }
        Ok(spec)
    }
}

#[cfg(test)]
mod tests {
    use super::ChartSpec;
    const EXAMPLE: &str = r#"{"version":1,"type":"bar","title":"Weekly notes","labels":["Mon","Tue"],"series":[{"name":"Notes","values":[4,7]}]}"#;
    #[test]
    fn validates_chart_data_and_round_trips_the_typed_fence() {
        let spec = ChartSpec::parse(EXAMPLE).unwrap();
        assert_eq!(
            ChartSpec::parse(&serde_json::to_string(&spec).unwrap()).unwrap(),
            spec
        );
        let note = format!("# Chart\n\n```htmd:chart\n{EXAMPLE}\n```\n\nAfter.\n");
        let blocks = crate::blocks(&note);
        assert_eq!(blocks.len(), 3);
        assert_eq!(
            blocks
                .iter()
                .map(|block| block.source.as_str())
                .collect::<String>(),
            note
        );
    }
    #[test]
    fn rejects_unknown_versions_mismatched_values_and_unsafe_numbers() {
        assert!(ChartSpec::parse(&EXAMPLE.replace("\"version\":1", "\"version\":2")).is_err());
        assert!(ChartSpec::parse(&EXAMPLE.replace("[4,7]", "[4]")).is_err());
        assert!(ChartSpec::parse(&EXAMPLE.replace("[4,7]", "[-1,7]")).is_err());
        assert!(ChartSpec::parse(&EXAMPLE.replace("[4,7]", "[1e400,7]")).is_err());
    }
}
