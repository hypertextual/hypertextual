# hyped-fs — software architecture

## Overview

Private `hyped-fs` owns the Hypertextual workspace models and native persistence services. The desktop application supplies a home directory and adapts Tauri commands to these services. The crate preserves the existing workspace, article, and media behavior without a Tauri dependency. It implements Hypertextual workspace policy. Remote file synchronization remains future work.

## Requirement

### Functional

- Open the default workspace under `.hypertextual/workspace` and list visible entries.
- Confine paths and resolved links to that workspace.
- Create, rename, and delete articles and folders without overwriting occupied entries.
- Validate article formats and image headers, enforce size limits, and derive filenames.
- Save complete article bytes with revision checks, permission preservation, and temporary-file cleanup.
- Store images beside their articles and return portable references and display URLs.

### Non-Functional

- Keep the crate private with `publish = false` and a local Cargo path dependency.
- Keep Tauri, frontend autosave scheduling, and editor JSON conversion outside the crate.
- Preserve platform-specific rename, directory synchronization, and system Trash behavior.
- Test public Hypertextual operations against isolated temporary homes.

## Design

### Components and Responsibilities

```mermaid
flowchart TD
    Frontend[Frontend workspace client] --> Commands[Desktop Tauri commands]
    Commands --> Guard[Shared workspace mutation guard]
    subgraph Library[hyped-fs]
      Workspace[WorkspaceService]
      Article[ArticleService]
      Media[MediaService]
      Models[Workspace, article, image, and error models]
      Article --> Workspace
      Media --> Workspace
      Workspace --> Models
      Article --> Models
      Media --> Models
    end
    Guard --> Workspace
    Guard --> Article
    Guard --> Media
    Workspace --> Files[Workspace files and system Trash]
    Article --> Files
    Media --> Files
```

The crate owns workspace location rules, sorting and hidden entries, name validation, article extensions, image types and names, and revision acceptance. It also owns the corresponding serialized models and error codes. The desktop owns Tauri state, command dispatch, blocking-task execution, and close/quit events. Frontend services own selection, drafts, autosave scheduling, and recovery presentation.

### Data and Control Flow

```mermaid
flowchart TD
    Request[Tauri command receives source and expected revision] --> Article[ArticleService validates size and reads current content]
    Article --> Revision{Revision matches?}
    Revision -->|same content already saved| Retry[Return current revision]
    Revision -->|different content| Conflict[Return conflict without overwriting]
    Revision -->|yes| Stage[Write and sync a temporary file beside the article]
    Stage --> Check[Recheck revision and resolved destination]
    Check -->|changed| Drop[Drop the temporary file and return conflict]
    Check -->|unchanged| Commit[Replace the article and sync its parent on Unix]
    Commit --> Name[Apply title-based naming without overwriting]
    Name --> Saved[Return article path, filename, and revision]
```

The existing article service performs this sequence inside `hyped-fs`. The desktop delegates revision policy to the article service. Tauri commands retain the shared mutation guard across workspace, article, and media operations. The app receives the same source text, revisions, image assets, and error payloads as before.

### Interfaces and Contracts

`WorkspaceService::from_home(home)` selects the default Hypertextual workspace. Operation paths remain relative to that workspace, and serialized entry paths use forward slashes. The desktop supplies the operating-system home directory through Tauri.

| Public service      | Responsibilities                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `WorkspaceRegistry` | `from_home`, `list`, `active`, `open_folder`, `create_folder_workspace`, `switch`, `rename`, `relocate`, `remove`, `read_ui_state`, `patch_ui_state` |
| `WorkspaceService`  | `from_home`, `from_root`, `open`, `list`, `create_folder_in`, `rename`, and `delete`                                            |
| `ArticleService`    | `new`, `create`, `create_file`, `read`, `write`, and `save`                                                                     |
| `MediaService`      | `new`, `import`, and `read`                                                                                                     |

`Workspace`, `WorkspaceBacking` (`Local`, `Synced`, `Remote`), `WorkspaceSyncState`, `WorkspaceRecord`, `WorkspaceRegistrySnapshot`, `WorkspaceUiState`, `WorkspaceStatePatch`, `WorkspaceListing`, `WorkspaceNode`, `ArticleContent`, `ArticleMetadata`, and `FileAsset` live in the crate. `WorkspaceRegistry` stores tracked workspaces in `~/.hypertextual/workspaces.json` (keyed by unique human-readable `name`) and per-workspace UI state in `~/.hypertextual/workspaces/<name>/state.json` without writing marker files into workspace folders. `WorkspaceService::list` excludes `.git`, `.DS_Store`, and atomic-save temporary files. `WorkspaceError` and `Result` preserve the existing transport payloads without depending on Tauri. Model methods remain limited to factories, validation, mapping, and derived values. Services perform filesystem access.

Article reads return `ArticleContent { content, revision }`. The revision is a SHA-256 hash of the file bytes. Writes require the expected revision. Saves also receive an app-derived title and return `ArticleMetadata { path, name, revision }` after filename selection.

Media operations return `FileAsset { source, url }`. The source is a portable relative reference. The URL is a data URL for display. The app media service can replace it with a Blob URL, an object URL for asset bytes held in memory. Remote HTTP image loading belongs to that app service.

Articles use `.md` or `.htmd`, contain UTF-8 text, and exclude null bytes. Articles and file assets each have a 16 MiB limit. Supported file assets include PNG, JPEG, GIF, WebP, SVG (including `.drawio.svg`), `.drawio.png`, and Draw.io XML (`.drawio`). Imported files use content hashes under the article's adjacent `.media` directory (legacy `.images` paths remain readable). `WorkspaceError { code, message }` describes containment, validation, revision, permission, and I/O failures.

## Implementation

### Package ownership

Premise generated `libs/hyped-fs` as a private isolated crate. The root Cargo workspace excludes it, and the desktop uses `hyped-fs = { path = "../../libs/hyped-fs" }`. The existing native model and service modules moved into the crate together. The crate exposes the application services directly.

`src/models` contains workspace, article, and image models. `src/services` contains the corresponding native services. `src/error.rs` owns their existing error contract. The desktop's `src/workspace.rs` is the Tauri adapter, and `src/lib.rs` handles application setup and lifecycle.

### Behavior evidence and limits

`tests/workspace.rs` exercises the public workspace API and includes article and media behavior modules. The 36 lifted service cases retain their Given, When, and Then contexts and isolated temporary homes. They cover containment, occupied names, permissions, revision conflicts, retry behavior, titles, and media references.

The browser suite uses a filesystem-backed Tauri substitute and does not execute this Rust crate. Native windows and system Trash behavior require native checks. Remote file synchronization remains future work.

## References

- [Library entry point](../../libs/hyped-fs/README.md)
- [System architecture](index.md)
- [Public library API](../../libs/hyped-fs/src/lib.rs)
- [Workspace models](../../libs/hyped-fs/src/models/workspace.rs)
- [Workspace service](../../libs/hyped-fs/src/services/workspace.rs)
- [Article service](../../libs/hyped-fs/src/services/article.rs)
- [Media service](../../libs/hyped-fs/src/services/media.rs)
- [Desktop commands](../../apps/hypertextual-desktop/src/workspace.rs)
- [Development commands](../development.md)
