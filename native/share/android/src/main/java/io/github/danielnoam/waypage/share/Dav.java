package io.github.danielnoam.waypage.share;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * A WebDAV folder's listing (the WebDAV extension, src/webdav.js). Android's
 * HttpURLConnection, and so CapacitorHttp, refuses any method but the eight
 * it knows, and a listing is PROPFIND. So this one request is written by
 * hand over a socket: HTTP/1.1, one request per connection, TLS checked
 * against the phone's own certificates and the host's name. No Android
 * classes, so test/webdav.test.js compiles and runs it on its own.
 *
 *   propfind(url, auth, depth)   { status, url, text }; a redirect on the
 *                                same server is followed (three at most),
 *                                one to another server is not, so the
 *                                login never goes anywhere else
 */
public final class Dav {
    public static final class Result {
        public int status;
        public String url;
        public String text;
    }

    private static final int TIMEOUT = 20000;
    private static final int MOST = 16 << 20;
    private static final String ASK = "<?xml version=\"1.0\" encoding=\"utf-8\"?>"
        + "<d:propfind xmlns:d=\"DAV:\"><d:prop><d:displayname/><d:resourcetype/>"
        + "<d:getcontentlength/><d:getlastmodified/><d:getcontenttype/></d:prop></d:propfind>";

    private Dav() {}

    public static Result propfind(String url, String auth, String depth) throws IOException {
        URI at = URI.create(url);
        for (int hops = 0; ; hops++) {
            Result r = once(at, auth, depth);
            if (r.status < 300 || r.status >= 400 || hops >= 3 || r.url == null) {
                r.url = at.toString();
                return r;
            }
            URI next = at.resolve(r.url);
            if (!origin(next).equals(origin(at))) {
                r.url = at.toString();
                return r;
            }
            at = next;
        }
    }

    private static String origin(URI u) {
        return (u.getScheme() + "://" + u.getHost() + ":" + port(u)).toLowerCase(Locale.ROOT);
    }

    private static int port(URI u) {
        if (u.getPort() > 0) return u.getPort();
        return "https".equalsIgnoreCase(u.getScheme()) ? 443 : 80;
    }

    private static Result once(URI u, String auth, String depth) throws IOException {
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) throw new IOException("Not a web address");
        String host = u.getHost();
        if (host == null) throw new IOException("No host");
        int port = port(u);
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), TIMEOUT);
            s.setSoTimeout(TIMEOUT);
            if (scheme.equals("https")) s = secure(s, host, port);
            String path = u.getRawPath() == null || u.getRawPath().isEmpty() ? "/" : u.getRawPath();
            if (u.getRawQuery() != null) path += "?" + u.getRawQuery();
            byte[] body = ASK.getBytes(StandardCharsets.UTF_8);
            String bare = host.contains(":") ? "[" + host + "]" : host;
            StringBuilder head = new StringBuilder();
            head.append("PROPFIND ").append(path).append(" HTTP/1.1\r\n");
            head.append("Host: ").append(bare).append(u.getPort() > 0 ? ":" + u.getPort() : "").append("\r\n");
            head.append("Depth: ").append("0".equals(depth) ? "0" : "1").append("\r\n");
            head.append("Content-Type: application/xml; charset=utf-8\r\n");
            head.append("Content-Length: ").append(body.length).append("\r\n");
            head.append("Accept: application/xml, text/xml\r\n");
            head.append("User-Agent: Waypage\r\n");
            if (auth != null && !auth.isEmpty()) head.append("Authorization: ").append(clean(auth)).append("\r\n");
            head.append("Connection: close\r\n\r\n");
            OutputStream out = s.getOutputStream();
            out.write(head.toString().getBytes(StandardCharsets.ISO_8859_1));
            out.write(body);
            out.flush();
            return read(s.getInputStream());
        } finally {
            try { s.close(); } catch (IOException e) { /* closed */ }
        }
    }

    // No line breaks in a header, so a login can't add one of its own.
    private static String clean(String v) {
        return v.replace("\r", "").replace("\n", "");
    }

    private static Socket secure(Socket plain, String host, int port) throws IOException {
        SSLSocket s = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(plain, host, port, true);
        s.startHandshake();
        HostnameVerifier names = HttpsURLConnection.getDefaultHostnameVerifier();
        if (!names.verify(host, s.getSession())) {
            s.close();
            throw new IOException("The certificate isn't for " + host);
        }
        return s;
    }

    private static String line(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        for (;;) {
            int c = in.read();
            if (c < 0) { if (b.size() == 0) return null; break; }
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 65536) throw new IOException("Header too long");
        }
        return b.toString("ISO-8859-1");
    }

    private static Result read(InputStream in) throws IOException {
        Result r = new Result();
        Map<String, String> headers;
        // A 100 Continue may come first.
        for (;;) {
            String status = line(in);
            if (status == null) throw new IOException("No answer");
            String[] parts = status.split(" ", 3);
            if (parts.length < 2 || !parts[0].startsWith("HTTP/")) throw new IOException("Not HTTP");
            r.status = Integer.parseInt(parts[1].trim());
            headers = new LinkedHashMap<>();
            for (String h; (h = line(in)) != null && !h.isEmpty(); ) {
                int c = h.indexOf(':');
                if (c > 0) headers.put(h.substring(0, c).trim().toLowerCase(Locale.ROOT), h.substring(c + 1).trim());
            }
            if (r.status != 100) break;
        }
        r.url = headers.get("location");
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        String te = headers.get("transfer-encoding");
        String len = headers.get("content-length");
        if (te != null && te.toLowerCase(Locale.ROOT).contains("chunked")) {
            for (;;) {
                String size = line(in);
                if (size == null) break;
                int semi = size.indexOf(';');
                int n = Integer.parseInt((semi >= 0 ? size.substring(0, semi) : size).trim(), 16);
                if (n == 0) break;
                copy(in, body, n);
                line(in);
            }
        } else if (len != null) {
            copy(in, body, Integer.parseInt(len.trim()));
        } else {
            byte[] buf = new byte[1 << 14];
            for (int n; (n = in.read(buf)) >= 0; ) {
                body.write(buf, 0, n);
                if (body.size() > MOST) throw new IOException("Too big");
            }
        }
        r.text = body.toString("UTF-8");
        return r;
    }

    private static void copy(InputStream in, ByteArrayOutputStream to, int n) throws IOException {
        if (n < 0 || to.size() + n > MOST) throw new IOException("Too big");
        byte[] buf = new byte[Math.min(n, 1 << 14)];
        while (n > 0) {
            int got = in.read(buf, 0, Math.min(buf.length, n));
            if (got < 0) throw new IOException("Cut short");
            to.write(buf, 0, got);
            n -= got;
        }
    }
}
