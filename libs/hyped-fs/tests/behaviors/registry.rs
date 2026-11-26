mod given_a_workspace_registry {
    use hyped_fs::{
        DEFAULT_WORKSPACE_NAME, WorkspaceBacking, WorkspaceRegistry, WorkspaceService,
        WorkspaceStatePatch, WorkspaceSyncState,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn when_opening_same_canonical_path_twice_then_it_deduplicates_by_path() {
        // Arrange
        let home = tempdir().unwrap();
        let docs = tempdir().unwrap();
        let registry = WorkspaceRegistry::from_home(home.path().to_owned());

        // Act
        let first = registry
            .open_folder(docs.path().to_owned(), "docs")
            .unwrap();
        let second = registry
            .open_folder(docs.path().to_owned(), "other-name")
            .unwrap();
        let snapshot = registry.list().unwrap();

        // Assert
        assert_eq!(first.name, "docs");
        assert_eq!(second.name, "docs");
        assert_eq!(snapshot.active_workspace, "docs");
        assert_eq!(snapshot.workspaces.len(), 2); // default + docs
    }

    #[test]
    fn when_registering_a_duplicate_or_empty_name_then_it_rejects_with_name_unavailable_or_invalid_name()
     {
        // Arrange
        let home = tempdir().unwrap();
        let first_dir = tempdir().unwrap();
        let second_dir = tempdir().unwrap();
        let registry = WorkspaceRegistry::from_home(home.path().to_owned());
        registry
            .open_folder(first_dir.path().to_owned(), "Docs")
            .unwrap();

        // Act
        let dup_err = registry
            .open_folder(second_dir.path().to_owned(), "docs")
            .unwrap_err();
        let empty_err = registry
            .open_folder(second_dir.path().to_owned(), "   ")
            .unwrap_err();

        // Assert
        assert_eq!(dup_err.code, "nameUnavailable");
        assert_eq!(empty_err.code, "invalidName");
    }

    #[test]
    fn when_opening_a_folder_with_dot_git_and_ds_store_then_zero_marker_files_are_written_and_hidden_entries_are_excluded()
     {
        // Arrange
        let home = tempdir().unwrap();
        let repo_docs = tempdir().unwrap();
        fs::create_dir_all(repo_docs.path().join(".git")).unwrap();
        fs::write(repo_docs.path().join(".DS_Store"), b"mac").unwrap();
        fs::write(repo_docs.path().join("guide.md"), "# Guide\n").unwrap();
        let registry = WorkspaceRegistry::from_home(home.path().to_owned());

        // Act
        let record = registry
            .open_folder(repo_docs.path().to_owned(), "repo-docs")
            .unwrap();
        let ws = WorkspaceService::from_root(repo_docs.path().to_owned());
        let entries = ws.list("").unwrap();

        // Assert
        assert_eq!(record.name, "repo-docs");
        assert!(!repo_docs.path().join(".hypertextual").exists());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "guide.md");
    }

    #[test]
    fn when_patching_and_reading_workspace_ui_state_then_partial_updates_merge_and_persist_under_workspaces_name_dir()
     {
        // Arrange
        let home = tempdir().unwrap();
        let docs = tempdir().unwrap();
        let registry = WorkspaceRegistry::from_home(home.path().to_owned());
        registry
            .open_folder(docs.path().to_owned(), "notes")
            .unwrap();

        // Act
        registry
            .patch_ui_state(
                "notes",
                WorkspaceStatePatch {
                    open_tabs: Some(vec!["a.md".into(), "b.md".into()]),
                    active_tab: Some(Some("b.md".into())),
                    ..Default::default()
                },
            )
            .unwrap();
        let merged = registry
            .patch_ui_state(
                "notes",
                WorkspaceStatePatch {
                    expanded_folders: Some(vec!["Drafts".into()]),
                    sidebar_open: Some(false),
                    ..Default::default()
                },
            )
            .unwrap();
        let reloaded = registry.read_ui_state("notes").unwrap();

        // Assert
        assert_eq!(merged, reloaded);
        assert_eq!(reloaded.open_tabs, vec!["a.md", "b.md"]);
        assert_eq!(reloaded.active_tab.as_deref(), Some("b.md"));
        assert_eq!(reloaded.expanded_folders, vec!["Drafts"]);
        assert!(!reloaded.sidebar_open);
        assert!(
            home.path()
                .join(".hypertextual/workspaces/notes/state.json")
                .is_file()
        );
        assert!(!docs.path().join(".hypertextual").exists());
    }

    #[test]
    fn when_renaming_a_workspace_then_registry_entry_and_ui_state_directory_rename_together() {
        // Arrange
        let home = tempdir().unwrap();
        let docs = tempdir().unwrap();
        let registry = WorkspaceRegistry::from_home(home.path().to_owned());
        registry.open_folder(docs.path().to_owned(), "old").unwrap();
        registry
            .patch_ui_state(
                "old",
                WorkspaceStatePatch {
                    open_tabs: Some(vec!["one.md".into()]),
                    ..Default::default()
                },
            )
            .unwrap();

        // Act
        let renamed = registry.rename("old", "renamed-ws").unwrap();
        let state = registry.read_ui_state("renamed-ws").unwrap();
        let snapshot = registry.list().unwrap();

        // Assert
        assert_eq!(renamed.name, "renamed-ws");
        assert_eq!(snapshot.active_workspace, "renamed-ws");
        assert_eq!(state.open_tabs, vec!["one.md"]);
        assert!(!home.path().join(".hypertextual/workspaces/old").exists());
        assert!(
            home.path()
                .join(".hypertextual/workspaces/renamed-ws/state.json")
                .is_file()
        );
    }

    #[test]
    fn when_persisting_local_synced_and_remote_records_then_backing_variants_round_trip_and_remote_returns_unsupported_workspace()
     {
        // Arrange
        let home = tempdir().unwrap();
        let synced_dir = tempdir().unwrap();
        let synced_canonical = synced_dir.path().canonicalize().unwrap();
        let app_dir = home.path().join(".hypertextual");
        fs::create_dir_all(&app_dir).unwrap();
        let raw = serde_json::json!({
            "schemaVersion": 1,
            "activeWorkspace": "synced-notes",
            "workspaces": [
                {
                    "name": "synced-notes",
                    "backing": {
                        "kind": "synced",
                        "path": synced_canonical.to_string_lossy(),
                        "accountId": "acct_1",
                        "remoteWorkspaceId": "ws_remote_1",
                        "syncState": "pending",
                        "rootDeviceId": 42
                    },
                    "lastOpenedAt": 100,
                    "available": true
                },
                {
                    "name": "cloud-only",
                    "backing": {
                        "kind": "remote",
                        "accountId": "acct_1",
                        "remoteWorkspaceId": "ws_remote_2"
                    },
                    "lastOpenedAt": 50,
                    "available": false
                }
            ]
        });
        fs::write(
            app_dir.join("workspaces.json"),
            serde_json::to_vec_pretty(&raw).unwrap(),
        )
        .unwrap();
        let registry = WorkspaceRegistry::from_home(home.path().to_owned());

        // Act
        let snapshot = registry.list().unwrap();
        let remote_err = registry.switch("cloud-only").unwrap_err();

        // Assert
        assert_eq!(remote_err.code, "unsupportedWorkspace");
        assert_eq!(
            snapshot.workspaces[0].backing,
            WorkspaceBacking::Synced {
                path: synced_canonical.to_string_lossy().into_owned(),
                account_id: "acct_1".into(),
                remote_workspace_id: "ws_remote_1".into(),
                sync_state: WorkspaceSyncState::Pending,
                root_device_id: Some(42),
            }
        );
        assert_eq!(
            snapshot.workspaces[1].backing,
            WorkspaceBacking::Remote {
                account_id: "acct_1".into(),
                remote_workspace_id: "ws_remote_2".into(),
            }
        );
    }

    #[test]
    fn when_registered_folder_is_deleted_then_open_returns_missing_workspace_without_recreating_it()
    {
        // Arrange
        let home = tempdir().unwrap();
        let docs = tempdir().unwrap();
        let docs_path = docs.path().to_owned();
        let registry = WorkspaceRegistry::from_home(home.path().to_owned());
        registry.open_folder(docs_path.clone(), "temp-ws").unwrap();
        drop(docs); // deletes folder on disk

        // Act
        let switch_err = registry.switch("temp-ws").unwrap_err();
        let open_err = WorkspaceService::from_root(docs_path.clone())
            .open()
            .unwrap_err();

        // Assert
        assert_eq!(switch_err.code, "missingWorkspace");
        assert_eq!(open_err.code, "missingWorkspace");
        assert!(!docs_path.exists());
    }

    #[test]
    fn when_relocating_a_missing_workspace_then_name_and_backing_metadata_are_preserved() {
        // Arrange
        let home = tempdir().unwrap();
        let old_dir = tempdir().unwrap();
        let new_dir = tempdir().unwrap();
        let old_path = old_dir.path().canonicalize().unwrap();
        let app_dir = home.path().join(".hypertextual");
        fs::create_dir_all(&app_dir).unwrap();
        let raw = serde_json::json!({
            "schemaVersion": 1,
            "activeWorkspace": "journal",
            "workspaces": [{
                "name": "journal",
                "backing": {
                    "kind": "synced",
                    "path": old_path.to_string_lossy(),
                    "accountId": "acct_9",
                    "remoteWorkspaceId": "ws_9",
                    "syncState": "idle"
                },
                "lastOpenedAt": 10,
                "available": true
            }]
        });
        fs::write(
            app_dir.join("workspaces.json"),
            serde_json::to_vec_pretty(&raw).unwrap(),
        )
        .unwrap();
        drop(old_dir);
        let registry = WorkspaceRegistry::from_home(home.path().to_owned());

        // Act
        let relocated = registry
            .relocate("journal", new_dir.path().to_owned())
            .unwrap();

        // Assert
        assert_eq!(relocated.name, "journal");
        assert!(relocated.available);
        assert_eq!(
            relocated.backing,
            WorkspaceBacking::Synced {
                path: new_dir
                    .path()
                    .canonicalize()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                account_id: "acct_9".into(),
                remote_workspace_id: "ws_9".into(),
                sync_state: WorkspaceSyncState::Idle,
                root_device_id: None,
            }
        );
    }

    #[test]
    fn when_removing_the_last_workspace_then_default_workspace_is_restored_without_deleting_files_and_app_state_is_cleaned_up()
     {
        // Arrange
        let home = tempdir().unwrap();
        let docs = tempdir().unwrap();
        fs::write(docs.path().join("keep.md"), "# Keep\n").unwrap();
        let registry = WorkspaceRegistry::from_home(home.path().to_owned());
        registry
            .open_folder(docs.path().to_owned(), "docs")
            .unwrap();
        registry
            .patch_ui_state(
                "docs",
                WorkspaceStatePatch {
                    open_tabs: Some(vec!["keep.md".into()]),
                    ..Default::default()
                },
            )
            .unwrap();

        // Act
        registry.remove(DEFAULT_WORKSPACE_NAME).unwrap();
        let snapshot = registry.remove("docs").unwrap();

        // Assert
        assert!(docs.path().join("keep.md").is_file());
        assert!(!home.path().join(".hypertextual/workspaces/docs").exists());
        assert_eq!(snapshot.active_workspace, DEFAULT_WORKSPACE_NAME);
        assert_eq!(snapshot.workspaces.len(), 1);
    }
}
