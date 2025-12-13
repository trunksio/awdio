import io
import re
from pathlib import Path

from docx import Document as DocxDocument
from pypdf import PdfReader


class DocumentProcessor:
    """Processes documents (PDF, TXT, DOCX) into text chunks."""

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    async def extract_text(self, file_content: bytes, filename: str) -> str:
        """Extract text from document based on file type."""
        suffix = Path(filename).suffix.lower()

        if suffix == ".pdf":
            return self._extract_pdf(file_content)
        elif suffix == ".docx":
            return self._extract_docx(file_content)
        elif suffix in (".txt", ".md"):
            return file_content.decode("utf-8")
        else:
            raise ValueError(f"Unsupported file type: {suffix}")

    def _extract_pdf(self, content: bytes) -> str:
        """Extract text from PDF."""
        reader = PdfReader(io.BytesIO(content))
        text_parts = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
        return "\n\n".join(text_parts)

    def _extract_docx(self, content: bytes) -> str:
        """Extract text from DOCX."""
        doc = DocxDocument(io.BytesIO(content))
        text_parts = []
        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text)
        return "\n\n".join(text_parts)

    def chunk_text(self, text: str) -> list[dict]:
        """Split text into overlapping chunks."""
        # Clean up text
        text = self._clean_text(text)

        if not text:
            return []

        chunks = []
        start = 0
        chunk_index = 0

        while start < len(text):
            end = start + self.chunk_size

            # Try to break at sentence boundary
            if end < len(text):
                # Look for sentence end within last 20% of chunk
                search_start = start + int(self.chunk_size * 0.8)
                sentence_end = self._find_sentence_boundary(text, search_start, end)
                if sentence_end > search_start:
                    end = sentence_end

            chunk_text = text[start:end].strip()

            if chunk_text:
                chunks.append({
                    "content": chunk_text,
                    "chunk_index": chunk_index,
                    "start_char": start,
                    "end_char": end,
                })
                chunk_index += 1

            # Move start position with overlap
            start = end - self.chunk_overlap
            if start >= len(text):
                break

        return chunks

    def _clean_text(self, text: str) -> str:
        """Clean and normalize text."""
        # Replace multiple newlines with double newline
        text = re.sub(r"\n{3,}", "\n\n", text)
        # Replace multiple spaces with single space
        text = re.sub(r" {2,}", " ", text)
        # Strip leading/trailing whitespace
        return text.strip()

    def _find_sentence_boundary(self, text: str, start: int, end: int) -> int:
        """Find the best sentence boundary in the given range."""
        # Look for sentence-ending punctuation followed by space or newline
        for i in range(end, start, -1):
            if i < len(text) and text[i - 1] in ".!?" and (
                i == len(text) or text[i] in " \n"
            ):
                return i
        return end

    async def process_document(
        self, file_content: bytes, filename: str
    ) -> tuple[str, list[dict]]:
        """Extract text and chunk a document. Returns (full_text, chunks)."""
        text = await self.extract_text(file_content, filename)
        chunks = self.chunk_text(text)
        return text, chunks
