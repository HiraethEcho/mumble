# Mumble — 极简云端留言板

Lite workflow project.

- `SPEC.md` — 目标 / 交付物 / 决策
- `PLAN.md` — 阶段与任务进度
- `init.md` — 原始技术文档（架构参考）
- `DESIGN.md` / `HANDOFF.md` — 按需生成

<!-- LITESPEC:START -->

# LiteSpec Instructions (lite workflow)

## Files

- `SPEC.md` — goal, what we're building, decisions (rare changes)
- `PLAN.md` — phases, tasks, progress checkboxes (frequent changes)
- `DESIGN.md` — architecture depth, only when a phase needs it
- `HANDOFF.md` — parked notes from /rest, read by /pickup on resume
- `README.md` / `CHANGELOG.md` — human mirrors, updated at phase-complete only

## Workflow

- New session / pickup → `/pickup` (reads AGENTS.md block + SPEC/PLAN/HANDOFF)
- New work → update `SPEC.md` (Decisions) + `PLAN.md` (tasks) before building
- Implement next task → `/lite-build` (tick the checkbox)
- Phase complete → `/archive` (rollup: PLAN done + SPEC decisions + README/CHANGELOG if user-facing)
- Pause / handoff → `/rest` (parked note in PLAN.md + HANDOFF.md)

## Rules

- Progress is derived from `PLAN.md` checkboxes only — never store a status line elsewhere.
<!-- LITESPEC:END -->
