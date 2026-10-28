# Dissertation Evaluation Results

This report was generated from the saved provider predictions.

## Dataset

| Measurement | Value |
|---|---:|
| Raw records | 231 |
| Unique dialogues | 213 |
| Duplicate annotation pairs | 18 |
| Gold findings | 5005 |
| Assertion conflicts | 96 |
| MediTOD commit | `0b7a87c3553c9056bc8371b0809811003f94b261` |

The 213 unique dialogues form the main evaluation corpus.
The 18 duplicate pairs are used for the inter-annotator reference.

## Inter-annotator reference

| Measurement | Value |
|---|---:|
| Duplicate pairs | 18 |
| Concept F1 | 0.9194 |
| Assertion agreement | 0.9668 |
| Cohen's kappa | 0.9218 |
| Assertion comparisons | 391 |

This is a reference point for interpreting results, not a fixed
performance ceiling.

## RQ1: Clinical finding extraction accuracy

| Provider | Precision | Recall | Concept F1 (95% CI) | Assertion-aware F1 (95% CI) |
|---|---:|---:|---:|---:|
| Openai | 0.4573 | 0.5201 | 0.4867 (0.4752 - 0.4976) | 0.4632 (0.4507 - 0.4745) |
| Anthropic | 0.4901 | 0.4799 | 0.4850 (0.4702 - 0.5009) | 0.4655 (0.4506 - 0.4819) |
| Ollama | 0.4758 | 0.2178 | 0.2988 (0.2769 - 0.3206) | 0.2825 (0.2610 - 0.3041) |

Assertion-aware F1 is the headline result because both the concept and its assertion must be correct.

## RQ2: Assertion classification

| Provider | Assertion accuracy | PRESENT recall | NEGATED recall | Prediction conflicts |
|---|---:|---:|---:|---:|
| Openai | 0.9514 | 0.5509 | 0.5140 | 2 |
| Anthropic | 0.9587 | 0.5433 | 0.4622 | 0 |
| Ollama | 0.9477 | 0.4810 | 0.1196 | 0 |

### Critical assertion errors

| Provider | False presence incidence (95% CI) | Conditional false presence | False negation incidence (95% CI) | Conditional false negation |
|---|---:|---:|---:|---:|
| Openai | 0.0088 (0.0052 - 0.0136) | 0.0171 | 0.0205 (0.0117 - 0.0307) | 0.0372 |
| Anthropic | 0.0077 (0.0043 - 0.0119) | 0.0166 | 0.0190 (0.0111 - 0.0283) | 0.0350 |
| Ollama | 0.0071 (0.0036 - 0.0115) | 0.0592 | 0.0046 (0.0008 - 0.0089) | 0.0095 |

False presence means a gold NEGATED finding was reported as PRESENT.
False negation is the reverse direction. Incidence uses every gold
finding of that assertion as its denominator. Conditional rates use
only findings the provider located and show N/A when none were found.

## Assertion confusion matrices

### Openai

Rows are gold assertions and columns are predictions.

| Gold | PRESENT | NEGATED | UNCERTAIN | CONFLICT |
|---|---:|---:|---:|---:|
| **PRESENT** | 664 | 27 | 34 | 0 |
| **NEGATED** | 29 | 1763 | 20 | 2 |
| **UNCERTAIN** | 5 | 8 | 21 | 0 |

### Anthropic

Rows are gold assertions and columns are predictions.

| Gold | PRESENT | NEGATED | UNCERTAIN | CONFLICT |
|---|---:|---:|---:|---:|
| **PRESENT** | 663 | 25 | 27 | 0 |
| **NEGATED** | 27 | 1597 | 7 | 0 |
| **UNCERTAIN** | 6 | 6 | 17 | 0 |

### Ollama

Rows are gold assertions and columns are predictions.

| Gold | PRESENT | NEGATED | UNCERTAIN | CONFLICT |
|---|---:|---:|---:|---:|
| **PRESENT** | 611 | 6 | 16 | 0 |
| **NEGATED** | 25 | 397 | 0 | 0 |
| **UNCERTAIN** | 8 | 1 | 6 | 0 |

The CONFLICT column contains concepts returned more than once with
different assertions. Conflicts never receive assertion credit.

## Evidence grounding

| Provider | Exact evidence | Normalised evidence | Missing evidence |
|---|---:|---:|---:|
| Openai | 0.9709 | 0.9782 | 0.0000 |
| Anthropic | 0.6409 | 0.6503 | 0.0000 |
| Ollama | 0.8290 | 0.8556 | 0.0000 |

Exact evidence requires a character-for-character transcript match.
Normalised evidence ignores case and punctuation differences.

## RQ3: Provider comparison

| Provider | Failure rate | Validation failure | Median latency ms | P95 latency ms | Cost USD |
|---|---:|---:|---:|---:|---:|
| Openai | 0.0000 | 0.0000 | 9271.3 | 13321.3 | 0.374525 |
| Anthropic | 0.0000 | 0.0000 | 6576.2 | 10109.3 | 1.556226 |
| Ollama | 0.0047 | 0.0047 | 14612.5 | 33542.7 | 0.000000 |

Failed calls remain part of accuracy evaluation as empty predictions.
Latency is calculated only from successful calls.

## Repeatability

The same fixed sample of 30 dialogues was sent twice.

| Provider | Dialogues | Concept Jaccard | Assertion agreement | Critical PRESENT/NEGATED changes |
|---|---:|---:|---:|---:|
| Openai | 30 | 0.7129 | 0.9971 | 1 |
| Anthropic | 30 | 0.9276 | 0.9986 | 0 |
| Ollama | 30 | 0.9390 | 0.9972 | 0 |

A critical change is the same concept changing directly between
PRESENT and NEGATED for an identical transcript.

## Paired provider differences

Both providers use the same resampled dialogue IDs.

| Metric | First | Second | Difference | 95% interval | Excludes zero |
|---|---|---|---:|---:|---|
| conceptF1 | Openai | Anthropic | 0.0017 | -0.0101 - 0.0135 | no |
| assertionAwareF1 | Openai | Anthropic | -0.0023 | -0.0147 - 0.0099 | no |
| falsePresenceIncidence | Openai | Anthropic | 0.0011 | -0.0003 - 0.0027 | no |
| falseNegationIncidence | Openai | Anthropic | 0.0015 | -0.0038 - 0.0075 | no |
| conceptF1 | Openai | Ollama | 0.1879 | 0.1649 - 0.2107 | yes |
| assertionAwareF1 | Openai | Ollama | 0.1807 | 0.1574 - 0.2025 | yes |
| falsePresenceIncidence | Openai | Ollama | 0.0017 | -0.0003 - 0.0040 | no |
| falseNegationIncidence | Openai | Ollama | 0.0160 | 0.0076 - 0.0256 | yes |
| conceptF1 | Anthropic | Ollama | 0.1862 | 0.1639 - 0.2088 | yes |
| assertionAwareF1 | Anthropic | Ollama | 0.1831 | 0.1603 - 0.2059 | yes |
| falsePresenceIncidence | Anthropic | Ollama | 0.0006 | -0.0012 - 0.0026 | no |
| falseNegationIncidence | Anthropic | Ollama | 0.0144 | 0.0069 - 0.0237 | yes |

An interval excluding zero indicates an observed difference on this
corpus. It does not establish clinical superiority.

## Interpretation limitations

- MediTOD contains simulated medical conversations.
- The evaluation measures extraction, not diagnosis.
- Body-location extraction is outside the evaluation scope.
- HISTORICAL assertions are not evaluated.
- The public case-level official test split is unavailable.
- Alert behaviour is treated as implementation testing, not a clinical research question.
