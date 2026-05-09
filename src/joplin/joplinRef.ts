// Joplin uses `:/<32-hex>` as a link convention for both notes and resources
// (images and other attachments). This module validates the shape only —
// distinguishing a note from a resource requires a data.get against the
// Joplin DB and is intentionally out of scope here.

const NOTE_REF_RE = /^:\/([a-f0-9]{32})$/i;

/** Returns the bare id if `file` matches `:/<32-hex>`, otherwise null. */
export function parseNoteRef(file: string): string | null {
	const match = NOTE_REF_RE.exec(file);
	return match ? match[1] : null;
}
