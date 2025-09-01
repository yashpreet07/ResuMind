export interface PdfConversionResult {
    imageUrl: string;
    file: File | null;
    error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
    if (pdfjsLib) return pdfjsLib;
    if (loadPromise) return loadPromise;

    isLoading = true;
    
    try {
        // @ts-expect-error - pdfjs-dist/build/pdf.js is not a module
        loadPromise = import("pdfjs-dist/build/pdf.js").then((lib) => {
            // Always use the worker shipped with the installed pdfjs-dist
            // to prevent API/Worker version mismatches
            lib.GlobalWorkerOptions.workerSrc = new URL(
                "pdfjs-dist/build/pdf.worker.min.js",
                import.meta.url
            ).toString();
            pdfjsLib = lib;
            isLoading = false;
            return lib;
        });

        return await loadPromise;
    } catch (error) {
        isLoading = false;
        loadPromise = null;
        throw error;
    }
}

export async function convertPdfToImage(
    file: File
): Promise<PdfConversionResult> {
    try {
        const lib = await loadPdfJs();

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        // Use a moderate scale to avoid hitting browser canvas limits
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
            return {
                imageUrl: "",
                file: null,
                error: "Failed to get canvas context",
            };
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        await page.render({ canvasContext: context, viewport }).promise;

        // Convert canvas to blob
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error("Failed to create blob from canvas"));
                }
            }, "image/png", 0.9);
        });

        const originalName = file.name.replace(/\.pdf$/i, "");
        const imageFile = new File([blob], `${originalName}.png`, {
            type: "image/png",
        });

        return {
            imageUrl: URL.createObjectURL(blob),
            file: imageFile,
        };
    } catch (err) {
        console.error("PDF conversion error:", err);
        return {
            imageUrl: "",
            file: null,
            error: `Failed to convert PDF: ${err instanceof Error ? err.message : err}`,
        };
    }
}