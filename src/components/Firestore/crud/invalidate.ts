import type { QueryClient } from "@tanstack/react-query";

/** Refreshes tree listings (collections + documents) of the project; open document queries are left alone. */
export function invalidateTree(queryClient: QueryClient, projectId: string | undefined) {
  return queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === "fs" && q.queryKey[1] === projectId && (q.queryKey[2] === "docs" || q.queryKey[2] === "collections"),
  });
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 20-char id like the Firestore SDK's auto ids. */
export function autoId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
