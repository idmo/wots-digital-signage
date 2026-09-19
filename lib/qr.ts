import QRCode from "qrcode";

/** Renders `text` (typically a URL) as a QR code and returns it as a base64
 * PNG data URI, suitable for direct use in an <img src>. */
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    margin: 1,
    width: 512,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
