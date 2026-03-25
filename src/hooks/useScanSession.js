import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function createPageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `scan-page-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function readImageDimensions(file) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.width || null, height: image.height || null });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: null, height: null });
    };
    image.src = objectUrl;
  });
}

async function createSessionPage(file, source = "picker") {
  const { width, height } = await readImageDimensions(file);
  return {
    id: createPageId(),
    file,
    previewUrl: URL.createObjectURL(file),
    source,
    createdAt: new Date().toISOString(),
    preprocessed: false,
    ocrStatus: "idle",
    ocrConfidence: null,
    warnings: [],
    quality: null,
    width,
    height,
    crop: null,
  };
}

export default function useScanSession() {
  const [pages, setPages] = useState([]);
  const pagesRef = useRef([]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    return () => {
      pagesRef.current.forEach((page) => {
        if (page.previewUrl) {
          URL.revokeObjectURL(page.previewUrl);
        }
      });
    };
  }, []);

  const addPage = useCallback(async (file, source = "picker") => {
    const page = await createSessionPage(file, source);
    setPages((current) => [...current, page]);
    return page;
  }, []);

  const replacePage = useCallback(async (pageId, file, source = "picker") => {
    const replacement = await createSessionPage(file, source);
    setPages((current) =>
      current.map((page) => {
        if (page.id !== pageId) {
          return page;
        }
        if (page.previewUrl) {
          URL.revokeObjectURL(page.previewUrl);
        }
        return {
          ...replacement,
          id: page.id,
          createdAt: page.createdAt,
        };
      })
    );
  }, []);

  const removePage = useCallback((pageId) => {
    setPages((current) => {
      const target = current.find((page) => page.id === pageId);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((page) => page.id !== pageId);
    });
  }, []);

  const movePage = useCallback((pageId, direction) => {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === pageId);
      if (index < 0) {
        return current;
      }
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const nextPages = [...current];
      const [page] = nextPages.splice(index, 1);
      nextPages.splice(nextIndex, 0, page);
      return nextPages;
    });
  }, []);

  const clearSession = useCallback(() => {
    setPages((current) => {
      current.forEach((page) => {
        if (page.previewUrl) {
          URL.revokeObjectURL(page.previewUrl);
        }
      });
      return [];
    });
  }, []);

  const patchPage = useCallback((pageId, updates) => {
    setPages((current) =>
      current.map((page) => (page.id === pageId ? { ...page, ...updates } : page))
    );
  }, []);

  const hasPages = useMemo(() => pages.length > 0, [pages.length]);

  return {
    pages,
    addPage,
    replacePage,
    removePage,
    movePage,
    clearSession,
    patchPage,
    hasPages,
  };
}
