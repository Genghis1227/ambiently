declare module 'libheif-js' {
  export class HeifDecoder {
    decode(buffer: Uint8Array | ArrayBuffer): Array<{
      get_width(): number;
      get_height(): number;
      display(
        imageData: ImageData | { data: Uint8ClampedArray; width: number; height: number },
        callback: (displayData: ImageData | null) => void
      ): void;
    }>;
  }
  const libheif: {
    HeifDecoder: typeof HeifDecoder;
  };
  export default libheif;
}
