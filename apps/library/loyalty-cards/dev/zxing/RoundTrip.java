// Development only (not shipped): reads back the codes dev/test-barcodes.mjs drew, with ZXing's decoders, and prints
// one line per code: "ok <index>" when the decoded text is the expected one, else "bad <index> <what was read>".
//
//   java -cp <zxing core jar> dev/zxing/RoundTrip.java <cases file>
//
// Each case in the file is one line: format, expected text (base64 of UTF-8), columns, rows, row height, linear (1 or
// 0), and the modules as a string of 0 and 1, row by row. Each code is drawn at 4 pixels a module with a quiet zone,
// as the app draws it on a white panel, and decoded with only its own format allowed.

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

public class RoundTrip {
    public static void main(String[] args) throws Exception {
        List<String> lines = Files.readAllLines(Path.of(args[0]), StandardCharsets.UTF_8);
        int index = 0;
        for (String line : lines) {
            if (line.isBlank()) continue;
            String[] f = line.split(" ");
            String format = f[0];
            String expected = new String(Base64.getDecoder().decode(f[1]), StandardCharsets.UTF_8);
            int columns = Integer.parseInt(f[2]);
            int rows = Integer.parseInt(f[3]);
            int rowHeight = Integer.parseInt(f[4]);
            boolean linear = f[5].equals("1");
            String modules = f[6];
            String read;
            try {
                read = decode(format, columns, rows, rowHeight, linear, modules);
            } catch (Exception e) {
                read = "(" + e.getClass().getSimpleName() + ")";
            }
            System.out.println((expected.equals(read) ? "ok " : "bad ") + index + (expected.equals(read) ? "" : " " + read));
            index++;
        }
    }

    static String decode(String format, int columns, int rows, int rowHeight, boolean linear, String modules)
            throws Exception {
        int scale = 4;
        int quiet = 12;
        int height = linear ? 60 : rows * rowHeight;
        int width = (columns + quiet * 2) * scale;
        int pixelsHigh = (height + quiet * 2) * scale;
        int[] pixels = new int[width * pixelsHigh];
        java.util.Arrays.fill(pixels, 0xFFFFFFFF);
        for (int y = 0; y < height; y++) {
            int row = linear ? 0 : y / rowHeight;
            for (int x = 0; x < columns; x++) {
                if (modules.charAt(row * columns + x) != '1') continue;
                for (int dy = 0; dy < scale; dy++) {
                    for (int dx = 0; dx < scale; dx++) {
                        pixels[((y + quiet) * scale + dy) * width + (x + quiet) * scale + dx] = 0xFF000000;
                    }
                }
            }
        }
        Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
        hints.put(DecodeHintType.POSSIBLE_FORMATS, List.of(zxingFormat(format)));
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        hints.put(DecodeHintType.RETURN_CODABAR_START_END, Boolean.TRUE);
        hints.put(DecodeHintType.ALLOWED_LENGTHS, new int[] {6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30});
        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(width, pixelsHigh, pixels)));
        Result result = new MultiFormatReader().decode(bitmap, hints);
        return result.getText();
    }

    static BarcodeFormat zxingFormat(String format) {
        switch (format) {
            case "ean13": return BarcodeFormat.EAN_13;
            case "ean8": return BarcodeFormat.EAN_8;
            case "upcA": return BarcodeFormat.UPC_A;
            case "upcE": return BarcodeFormat.UPC_E;
            case "code128": return BarcodeFormat.CODE_128;
            case "code39": return BarcodeFormat.CODE_39;
            case "code93": return BarcodeFormat.CODE_93;
            case "codabar": return BarcodeFormat.CODABAR;
            case "itf": return BarcodeFormat.ITF;
            case "qr": return BarcodeFormat.QR_CODE;
            case "dataMatrix": return BarcodeFormat.DATA_MATRIX;
            case "aztec": return BarcodeFormat.AZTEC;
            case "pdf417": return BarcodeFormat.PDF_417;
            default: throw new IllegalArgumentException(format);
        }
    }
}
