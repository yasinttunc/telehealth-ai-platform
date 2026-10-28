# Dissertation Evaluation Results (prompt v2)

This report was generated from the saved provider predictions.

> **Post-hoc exploratory experiment.** These results use a
> revised extraction prompt written after the primary run was
> scored. They do not replace the primary comparison and must
> not be reported as the main result.

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
| Openai | 0.5635 | 0.5822 | 0.5727 (0.5603 - 0.5839) | 0.5430 (0.5294 - 0.5557) |
| Anthropic | 0.6364 | 0.5598 | 0.5957 (0.5820 - 0.6102) | 0.5760 (0.5613 - 0.5910) |
| Ollama | 0.5440 | 0.2300 | 0.3233 (0.3008 - 0.3451) | 0.3056 (0.2839 - 0.3275) |

Assertion-aware F1 is the headline result because both the concept and its assertion must be correct.

## RQ2: Assertion classification

| Provider | Assertion accuracy | PRESENT recall | NEGATED recall | Prediction conflicts |
|---|---:|---:|---:|---:|
| Openai | 0.9459 | 0.6132 | 0.5784 | 1 |
| Anthropic | 0.9653 | 0.6292 | 0.5401 | 1 |
| Ollama | 0.9486 | 0.5380 | 0.1128 | 0 |

### Critical assertion errors

| Provider | False presence incidence (95% CI) | Conditional false presence | False negation incidence (95% CI) | Conditional false negation |
|---|---:|---:|---:|---:|
| Openai | 0.0060 (0.0033 - 0.0094) | 0.0103 | 0.0213 (0.0127 - 0.0314) | 0.0347 |
| Anthropic | 0.0071 (0.0041 - 0.0109) | 0.0131 | 0.0213 (0.0117 - 0.0329) | 0.0338 |
| Ollama | 0.0060 (0.0030 - 0.0101) | 0.0528 | 0.0076 (0.0030 - 0.0142) | 0.0141 |

False presence means a gold NEGATED finding was reported as PRESENT.
False negation is the reverse direction. Incidence uses every gold
finding of that assertion as its denominator. Conditional rates use
only findings the provider located and show N/A when none were found.

## Assertion confusion matrices

### Openai

Rows are gold assertions and columns are predictions.

| Gold | PRESENT | NEGATED | UNCERTAIN | CONFLICT |
|---|---:|---:|---:|---:|
| **PRESENT** | 730 | 28 | 49 | 0 |
| **NEGATED** | 20 | 1974 | 46 | 1 |
| **UNCERTAIN** | 3 | 9 | 25 | 0 |

### Anthropic

Rows are gold assertions and columns are predictions.

| Gold | PRESENT | NEGATED | UNCERTAIN | CONFLICT |
|---|---:|---:|---:|---:|
| **PRESENT** | 779 | 28 | 21 | 0 |
| **NEGATED** | 24 | 1875 | 6 | 1 |
| **UNCERTAIN** | 9 | 7 | 18 | 0 |

### Ollama

Rows are gold assertions and columns are predictions.

| Gold | PRESENT | NEGATED | UNCERTAIN | CONFLICT |
|---|---:|---:|---:|---:|
| **PRESENT** | 682 | 10 | 16 | 0 |
| **NEGATED** | 21 | 377 | 0 | 0 |
| **UNCERTAIN** | 6 | 5 | 11 | 0 |

The CONFLICT column contains concepts returned more than once with
different assertions. Conflicts never receive assertion credit.

## Evidence grounding

| Provider | Exact evidence | Normalised evidence | Missing evidence |
|---|---:|---:|---:|
| Openai | 0.9322 | 0.9730 | 0.0000 |
| Anthropic | 0.4451 | 0.4510 | 0.0000 |
| Ollama | 0.8517 | 0.8729 | 0.0000 |

Exact evidence requires a character-for-character transcript match.
Normalised evidence ignores case and punctuation differences.

## RQ3: Provider comparison

| Provider | Failure rate | Validation failure | Median latency ms | P95 latency ms | Cost USD |
|---|---:|---:|---:|---:|---:|
| Openai | 0.0000 | 0.0000 | 15021.8 | 21081.6 | 0.572337 |
| Anthropic | 0.0000 | 0.0000 | 6592.9 | 9924.6 | 1.616983 |
| Ollama | 0.0000 | 0.0000 | 16087.1 | 53926.7 | 0.000000 |

Failed calls remain part of accuracy evaluation as empty predictions.
Latency is calculated only from successful calls.

## Repeatability

The same fixed sample of 30 dialogues was sent twice.

| Provider | Dialogues | Concept Jaccard | Assertion agreement | Critical PRESENT/NEGATED changes |
|---|---:|---:|---:|---:|
| Openai | 30 | 0.7336 | 0.9892 | 1 |
| Anthropic | 30 | 0.9207 | 1.0000 | 0 |
| Ollama | 30 | 0.7274 | 1.0000 | 0 |

A critical change is the same concept changing directly between
PRESENT and NEGATED for an identical transcript.

## Paired provider differences

Both providers use the same resampled dialogue IDs.

| Metric | First | Second | Difference | 95% interval | Excludes zero |
|---|---|---|---:|---:|---|
| conceptF1 | Openai | Anthropic | -0.0229 | -0.0332 - -0.0130 | yes |
| assertionAwareF1 | Openai | Anthropic | -0.0330 | -0.0445 - -0.0220 | yes |
| falsePresenceIncidence | Openai | Anthropic | -0.0011 | -0.0029 - 0.0003 | no |
| falseNegationIncidence | Openai | Anthropic | 0.0000 | -0.0061 - 0.0062 | no |
| conceptF1 | Openai | Ollama | 0.2495 | 0.2269 - 0.2734 | yes |
| assertionAwareF1 | Openai | Ollama | 0.2374 | 0.2145 - 0.2625 | yes |
| falsePresenceIncidence | Openai | Ollama | 0.0000 | -0.0023 - 0.0023 | no |
| falseNegationIncidence | Openai | Ollama | 0.0137 | 0.0059 - 0.0232 | yes |
| conceptF1 | Anthropic | Ollama | 0.2724 | 0.2482 - 0.2975 | yes |
| assertionAwareF1 | Anthropic | Ollama | 0.2704 | 0.2472 - 0.2942 | yes |
| falsePresenceIncidence | Anthropic | Ollama | 0.0011 | -0.0011 - 0.0034 | no |
| falseNegationIncidence | Anthropic | Ollama | 0.0137 | 0.0046 - 0.0248 | yes |

An interval excluding zero indicates an observed difference on this
corpus. It does not establish clinical superiority.

## Prompt v1 versus prompt v2

The same gold reference, the same alias table and the same scoring code are used for both columns. Only the extraction prompt differs.

| Provider | Metric | Prompt v1 | Prompt v2 | Change |
|---|---|---:|---:|---:|
| Openai | Concept F1 | 0.4867 | 0.5727 | +0.0860 |
| Openai | Assertion-aware F1 | 0.4632 | 0.5430 | +0.0799 |
| Openai | Concept precision | 0.4573 | 0.5635 | +0.1062 |
| Openai | Concept recall | 0.5201 | 0.5822 | +0.0621 |
| Anthropic | Concept F1 | 0.4850 | 0.5957 | +0.1107 |
| Anthropic | Assertion-aware F1 | 0.4655 | 0.5760 | +0.1105 |
| Anthropic | Concept precision | 0.4901 | 0.6364 | +0.1463 |
| Anthropic | Concept recall | 0.4799 | 0.5598 | +0.0799 |
| Ollama | Concept F1 | 0.2988 | 0.3233 | +0.0245 |
| Ollama | Assertion-aware F1 | 0.2825 | 0.3056 | +0.0232 |
| Ollama | Concept precision | 0.4758 | 0.5440 | +0.0682 |
| Ollama | Concept recall | 0.2178 | 0.2300 | +0.0122 |

The intervals reported earlier in this file are not paired across prompt versions, so an apparent gain here is descriptive only. The primary result remains the prompt v1 comparison.

## Interpretation limitations

- MediTOD contains simulated medical conversations.
- The evaluation measures extraction, not diagnosis.
- Body-location extraction is outside the evaluation scope.
- HISTORICAL assertions are not evaluated.
- The public case-level official test split is unavailable.
- Alert behaviour is treated as implementation testing, not a clinical research question.
