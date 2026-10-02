import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { FirestoreApi, type FirestoreDocument } from "../../core";
import { useConnection } from "../../store/connection";

export const PAGE_SIZE = 25;

export function useFirestoreApi(): FirestoreApi | null {
  const connection = useConnection((s) => s.connection);
  return useMemo(
    () => (connection ? new FirestoreApi(connection.client, connection.projectId) : null),
    [connection],
  );
}

/** Root collections when `docPath` is "", otherwise the subcollections of that document. */
export function useCollectionIds(docPath: string, enabled = true) {
  const api = useFirestoreApi();
  return useQuery({
    queryKey: ["fs", api?.projectId, "collections", docPath],
    queryFn: () => api!.listAllCollectionIds(docPath || undefined),
    enabled: !!api && enabled,
  });
}

export function relativePath(doc: FirestoreDocument): string {
  const i = doc.name.indexOf("/documents/");
  return i >= 0 ? doc.name.slice(i + "/documents/".length) : doc.name;
}

/** showMissing documents come back without timestamps: they only exist as parents of subcollections. */
export function isMissing(doc: FirestoreDocument): boolean {
  return !doc.createTime && !doc.updateTime;
}

export function useDocsPage(collectionPath: string, enabled = true) {
  const api = useFirestoreApi();
  const query = useInfiniteQuery({
    queryKey: ["fs", api?.projectId, "docs", collectionPath],
    queryFn: ({ pageParam }) =>
      api!.listDocs(collectionPath, { pageSize: PAGE_SIZE, pageToken: pageParam, showMissing: true }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken,
    enabled: !!api && enabled,
  });
  const docs = useMemo(() => {
    const seen = new Set<string>();
    const out: FirestoreDocument[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const d of page.documents) {
        if (seen.has(d.name)) continue;
        seen.add(d.name);
        out.push(d);
      }
    }
    return out;
  }, [query.data]);
  return { query, docs };
}

export function useDocument(docPath: string | null) {
  const api = useFirestoreApi();
  return useQuery({
    queryKey: ["fs", api?.projectId, "doc", docPath],
    queryFn: () => api!.getDoc(docPath!),
    enabled: !!api && !!docPath,
  });
}
