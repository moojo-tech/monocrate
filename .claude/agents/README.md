# Monodrop Agent Architecture

This directory contains agent definitions for building and maintaining the Monodrop project.

## Agents

| Agent | File | Role |
|-------|------|------|
| Project Lead | [project-lead.md](./project-lead.md) | CEO / Team coordinator |
| Core Architect | [core-architect.md](./core-architect.md) | Bundling engine & API |
| CLI Developer | [cli-developer.md](./cli-developer.md) | Command-line interface |
| Security Engineer | [security-engineer.md](./security-engineer.md) | Security & supply chain safety |
| Quality Engineer | [quality-engineer.md](./quality-engineer.md) | Testing & CI/CD |
| Documentation Author | [documentation-author.md](./documentation-author.md) | User documentation |
| Brand Strategist | [brand-strategist.md](./brand-strategist.md) | Identity & messaging |
| Community Architect | [community-architect.md](./community-architect.md) | OSS infrastructure |
| Example Curator | [example-curator.md](./example-curator.md) | Examples & demos |
| Code Reviewer | [code-reviewer.md](./code-reviewer.md) | Quality guardian |

## How to Use

Each `.md` file contains the complete prompt/instructions for that agent. To invoke an agent:

1. Read the agent's markdown file
2. Use its instructions as context for the task at hand
3. The agent will follow its defined responsibilities and standards

## Team Structure

```
                              ┌─────────────────┐
                              │  project-lead   │
                              └────────┬────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │                              │                              │
        ▼                              ▼                              ▼
┌───────────────┐           ┌───────────────────┐          ┌───────────────┐
│brand-strategist│           │ quality-engineer  │          │community-architect│
└───────────────┘           └─────────┬─────────┘          └───────────────┘
        │                             │                            │
        ▼                    ┌────────┴────────┐                   ▼
┌───────────────┐            │                 │           ┌───────────────┐
│documentation- │            ▼                 ▼           │example-curator│
│    author     │    ┌───────────────┐ ┌───────────────┐   └───────────────┘
└───────────────┘    │ code-reviewer │ │security-engineer│
                     └───────┬───────┘ └───────┬───────┘
                             │                 │
                             └────────┬────────┘
                                      ▼
                         ┌─────────────────────────┐
                         │     core-architect      │
                         │     cli-developer       │
                         └─────────────────────────┘
```

## Workflow Phases

| Phase | Description | Key Agents |
|-------|-------------|------------|
| 0. Init | Charter, roadmap | project-lead |
| 1. Foundation | Identity, repo setup, architecture, threat model | brand-strategist, quality-engineer, core-architect, security-engineer |
| 2. Implementation | Core code, CLI, security patterns | core-architect, cli-developer, code-reviewer, security-engineer |
| 3. Documentation | Docs, examples, security docs | documentation-author, example-curator, security-engineer |
| 4. Pre-Release | Validation, security audit | quality-engineer, code-reviewer, security-engineer, project-lead |
| 5. Launch | Publish, announce | project-lead, community-architect |
| 6. Ongoing | Maintenance, security patches | All agents |

## Quality Standards

All agents adhere to these principles:

1. User experience over implementation convenience
2. Correctness over speed
3. Consistency over local optimization
4. Documentation accuracy over comprehensiveness
5. Community trust over feature velocity
