# Detected Projects and Runtime Status

Detection is broader than bundled runtime support.

| Project family | Detection marker examples | v0.1 environment setup | Bundled runtime control |
|---|---|---:|---:|
| HTML5/Web | `index.html`, `package.json` | yes | no; web adapter required |
| Phaser/Pixi/Three/Babylon | package dependencies or export HTML | yes | no; web adapter required |
| LÖVE2D | root `main.lua` | yes | no; LÖVE adapter required |
| Godot | `project.godot` | yes | no; target-specific adapter required |
| Unity | `Assets` + `ProjectSettings/ProjectVersion.txt` | yes | no; target-specific adapter required |
| Unreal | root `.uproject` | yes | no; target-specific adapter required |
| Defold | `game.project` | yes | no |
| GameMaker | root `.yyp` | yes | no |
| Construct | root `.c3p` or web export | yes | no; web adapter for exports |
| Ren'Py | root `.rpy` | yes | no |
| Bevy | `Cargo.toml` with Bevy | yes | no |
| MonoGame/FNA/XNA | `.csproj` references | yes | no |
| Unknown/custom engine | generic fallback | yes | manual adapter contract |

The generic fallback still creates the QA taxonomy, schemas, rule registry, evidence contract, and suite policies. It does not invent a launch command.
