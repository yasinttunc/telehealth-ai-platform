# Symptom Extraction Evaluation

An offline harness that measures how well three LLM providers turn a
consultation transcript into structured symptom findings: each finding has a
concept, an assertion (`PRESENT`, `NEGATED` or `UNCERTAIN`) and an evidence
quote. It was built for my MSc Computer Science dissertation at Swansea
University and runs separately from the application. It calls the providers
directly and never goes through the FastAPI service.

> **Synthetic data only.** The corpus is made of simulated consultations. These
> results describe extraction from simulated transcripts. They are not evidence
> of clinical performance.

## Setup

| | |
|---|---|
| Corpus | [MediTOD](https://github.com/dair-iitd/MediTOD) `raw_data/`, pinned to commit `0b7a87c3553c9056bc8371b0809811003f94b261`. Its dialogues are the simulated interviews published by Fareez et al. (2022) |
| Evaluation set | 213 unique dialogues and 5,005 gold findings. The 18 duplicate annotation pairs in the raw records are kept as an inter-annotator reference (concept F1 0.9194, Cohen's κ 0.9218) |
| Providers | OpenAI `gpt-5.6-luna`, Anthropic `claude-haiku-4-5-20251001`, and `gpt-oss:20b` served locally by Ollama |
| Conditions | Every provider gets the same transcript, the same system prompt and the same JSON schema |
| Statistics | 95% intervals from a dialogue-level cluster bootstrap (1,000 resamples, seed 20260825). Provider and prompt comparisons are paired. No p-values are reported |
| Normalisation | A 23-entry alias table, frozen before scoring and applied to reference and prediction alike |

## Prompts

Both prompts live in [`src/config.py`](src/config.py):

- **`SYSTEM_PROMPT` (v1)** has six rules. It was frozen before any result was
  scored and is the primary condition. The application's AI service uses the
  same text.
- **`SYSTEM_PROMPT_V2`** has twenty rules in six sections: finding, assertion,
  naming, evidence, confidence and output. It was written **after** the v1
  errors had been examined, on the same corpus, so its results are post-hoc and
  exploratory. None of the reference concept names appear in it, and a unit
  test guards against that.

## Headline results

Concept F1, with 95% intervals in parentheses:

| Provider | Prompt v1 (primary) | Prompt v2 (post-hoc) | Paired v2 − v1 |
|---|---|---|---|
| OpenAI | 0.4867 (0.4752–0.4976) | 0.5727 (0.5603–0.5839) | +0.0860 (0.0766–0.0949) |
| Anthropic | 0.4850 (0.4702–0.5009) | 0.5957 (0.5820–0.6102) | +0.1107 (0.0976–0.1234) |
| Ollama (local) | 0.2988 (0.2769–0.3206) | 0.3233 (0.3008–0.3451) | +0.0245 (−0.0006–0.0504) |

Three findings matter more than the headline:

- **Most of the v2 gain depends on the alias layer.** With aliases switched
  off on both sides, the v1 → v2 gain falls to +0.0371 (OpenAI) and +0.0275
  (Anthropic). v2 asks for standard clinical names, but the reference
  vocabulary is not consistently clinical.
- **One metric dropped without any real change in fidelity.** Anthropic's
  exact-evidence rate fell from 64.09% to 44.51% under v2, because rule 16 makes
  the model join a short answer to the question before it. On the adjacent-turn
  measure the same comparison is 97.53% → 97.14%.
- **Self-reported confidence ranks findings poorly.** Rank AUC is between 0.49
  and 0.61.

Full tables are in [`results/report.md`](results/report.md) (v1) and
[`results/report-promptv2.md`](results/report-promptv2.md) (v2).

## What is and is not in this folder

Included: the source code, the tests, both prompts, and aggregate result
files (`results/*.csv`, `results/*.json`, `results/*.md`).

Deliberately **not** included, and listed in `.gitignore`:

- **The MediTOD corpus** (`data/`) and the derived gold reference
  (`results/gold.json`). MediTOD publishes no licence for its annotations,
  so they are not redistributed here. Fetch them from the source (below).
- **Per-concept outputs** (`results/reachability-concepts.csv`,
  `results/reachability-alias.csv`, `results/reachability-analysis.md`). They
  list the reference labels. The reachability script regenerates them.
- **Raw model predictions** (`predictions/`). They quote transcript text.

## Reproducing

```bash
cd evaluation
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 1. Fetch the corpus at the pinned commit
git clone https://github.com/dair-iitd/MediTOD /tmp/meditod
git -C /tmp/meditod checkout 0b7a87c3553c9056bc8371b0809811003f94b261
mkdir -p data
cp /tmp/meditod/raw_data/dialogs.json /tmp/meditod/raw_data/annotations.json data/

# 2. Run the tests and validate the corpus (no provider calls)
python -m pytest -q
python src/run_all.py

# 3. Collect predictions (paid API calls) and score them
cp .env.example .env   # add your own API keys and prices
python src/run_all.py --confirm-paid-calls --prompt-version v1
python src/run_all.py --confirm-paid-calls --prompt-version v2
```

Corpus validation stops unless it reproduces the frozen counts: 231 raw
records, 213 dialogues, 18 duplicate pairs, 5,005 findings and 96 assertion
conflicts. Without the corpus, the two tests that need it are skipped and all
the others still run.

Collection asks for explicit confirmation before it makes any paid call. For
the 213-dialogue v1 run, the recorded cost was 0.37 USD for OpenAI and 1.56 USD
for Anthropic. Ollama costs nothing but needs a local `gpt-oss:20b`. Provider
models change over time, so fresh predictions may not match the recorded ones
exactly.

## Citation

Fareez, F., Parikh, T., Wavell, C. et al. *A dataset of simulated
patient-physician medical interviews with a focus on respiratory cases.*
Scientific Data 9, 313 (2022).

MediTOD: *An English Dialogue Dataset for Medical History Taking with
Comprehensive Annotations* (EMNLP 2024). See its repository for the full
citation.
