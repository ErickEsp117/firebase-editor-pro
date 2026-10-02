import { useCrudDialog } from "../../../store/crudDialog";
import { CreateDocDialog } from "./CreateDocDialog";
import { DeleteCollectionDialog } from "./DeleteCollectionDialog";
import { DeleteDocDialog } from "./DeleteDocDialog";

/** Renders whichever CRUD dialog is open; keyed so each opening starts with fresh state. */
export function CrudDialogs() {
  const dialog = useCrudDialog((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case "create":
      return <CreateDocDialog key={`c:${dialog.parentDocPath}|${dialog.collectionPath}`} parentDocPath={dialog.parentDocPath} collectionPath={dialog.collectionPath} />;
    case "deleteDoc":
      return <DeleteDocDialog key={`d:${dialog.path}`} path={dialog.path} />;
    case "deleteCollection":
      return <DeleteCollectionDialog key={`dc:${dialog.path}`} path={dialog.path} />;
  }
}
