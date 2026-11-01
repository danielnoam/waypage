// A small PowerPoint deck for the tests (1.49.0): the parts of the format
// that src/pptx.js draws. Three slides, the last one hidden.
//   1  a title and bullets (placeholders from the layout and master)
//   2  a table, a group holding a shape with words, a Hebrew line, a
//      picture, a picture that points outside the file and a chart
//   3  hidden
const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const rels = (list) => '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + list.map(([id, type, target, ext]) => '<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + type + '" Target="' + target + '"' + (ext ? ' TargetMode="External"' : "") + "/>").join("") + "</Relationships>";
const xfrm = (x, y, w, h) => '<a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + h + '"/></a:xfrm>';
const tree = (inner) => '<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + inner + "</p:spTree></p:cSld>";
const ph = (id, type, idx, geo, text) => '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="ph' + id + '"/><p:cNvSpPr/><p:nvPr><p:ph type="' + type + '"' + (idx ? ' idx="' + idx + '"' : "") + "/></p:nvPr></p:nvSpPr><p:spPr>"
  + (geo ? xfrm(...geo) : "") + "</p:spPr>" + (text ? "<p:txBody><a:bodyPr/><a:lstStyle/>" + text + "</p:txBody>" : "") + "</p:sp>";
const para = (t, extra) => "<a:p>" + (extra || "") + '<a:r><a:rPr lang="en-US"/><a:t>' + t + "</a:t></a:r></a:p>";

function pptxFiles() {
  const slide1 = '<?xml version="1.0" encoding="UTF-8"?><p:sld ' + A + ">" + tree(
    ph(2, "title", "", null, para("Quarterly Review"))
    + ph(3, "body", "1", null, para("First point about the night train") + para("Second point about the hills"))) + "</p:sld>";
  const cell = (t) => "<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>" + para(t) + "</a:txBody><a:tcPr/></a:tc>";
  const table = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="457200" y="457200"/><a:ext cx="4000000" cy="800000"/></p:xfrm>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"><a:tableStyleId>{5C22544A}</a:tableStyleId></a:tblPr><a:tblGrid><a:gridCol w="2000000"/><a:gridCol w="2000000"/></a:tblGrid>'
    + '<a:tr h="400000">' + cell("Region") + cell("Sales") + '</a:tr><a:tr h="400000">' + cell("Northern") + cell("4200") + "</a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>";
  const group = '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="457200" y="1800000"/><a:ext cx="3000000" cy="600000"/><a:chOff x="0" y="0"/><a:chExt cx="1500000" cy="300000"/></a:xfrm></p:grpSpPr>'
    + '<p:sp><p:nvSpPr><p:cNvPr id="6" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>' + xfrm(0, 0, 1500000, 300000) + '<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent2"/></a:solidFill></p:spPr>'
    + '<p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1200"/><a:t>Grouped words inside</a:t></a:r></a:p></p:txBody></p:sp></p:grpSp>';
  const hebrew = '<p:sp><p:nvSpPr><p:cNvPr id="7" name="h"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>' + xfrm(457200, 2600000, 4000000, 500000) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>'
    + '<a:p><a:pPr algn="r" rtl="1"/><a:r><a:rPr lang="he-IL" sz="2000"/><a:t>שלום עולם</a:t></a:r></a:p></p:txBody></p:sp>';
  const pic = (id, rid) => '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="pic"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="' + rid + '"/><a:stretch/></p:blipFill><p:spPr>' + xfrm(5000000, 457200, 800000, 800000) + "</p:spPr></p:pic>";
  const chart = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="c"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="5000000" y="1800000"/><a:ext cx="1000000" cy="800000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame>';
  const slide2 = '<?xml version="1.0" encoding="UTF-8"?><p:sld ' + A + ">" + tree(table + group + hebrew + pic(8, "rId2") + pic(10, "rId3") + chart) + "</p:sld>";
  const slide3 = '<?xml version="1.0" encoding="UTF-8"?><p:sld ' + A + ' show="0">' + tree(ph(2, "title", "", null, para("Hidden slide words"))) + "</p:sld>";
  const layout = '<?xml version="1.0" encoding="UTF-8"?><p:sldLayout ' + A + ">" + tree(
    ph(2, "title", "", [457200, 300000, 8200000, 800000], "") + ph(3, "body", "1", [457200, 1300000, 8200000, 3000000], "")) + "</p:sldLayout>";
  const master = '<?xml version="1.0" encoding="UTF-8"?><p:sldMaster ' + A + ">" + tree(
    ph(2, "title", "", [457200, 300000, 8200000, 800000], "") + ph(3, "body", "1", [457200, 1300000, 8200000, 3000000], ""))
    + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    + '<p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4000" b="1"/></a:lvl1pPr></p:titleStyle>'
    + '<p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buChar char="•"/><a:defRPr sz="2400"/></a:lvl1pPr></p:bodyStyle><p:otherStyle/></p:txStyles></p:sldMaster>';
  const theme = '<?xml version="1.0" encoding="UTF-8"?><a:theme ' + A + ' name="t"><a:themeElements><a:clrScheme name="c"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2>'
    + '<a:accent1><a:srgbClr val="2563EB"/></a:accent1><a:accent2><a:srgbClr val="DC2626"/></a:accent2><a:accent3><a:srgbClr val="16A34A"/></a:accent3><a:accent4><a:srgbClr val="CA8A04"/></a:accent4><a:accent5><a:srgbClr val="9333EA"/></a:accent5><a:accent6><a:srgbClr val="0891B2"/></a:accent6><a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink></a:clrScheme>'
    + '<a:fontScheme name="f"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>';
  const pres = '<?xml version="1.0" encoding="UTF-8"?><p:presentation ' + A + '><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst>'
    + '<p:sldSz cx="9144000" cy="5143500"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:defaultTextStyle></p:presentation>';
  return [
    ["[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'],
    ["_rels/.rels", rels([["rId1", "officeDocument", "ppt/presentation.xml"]])],
    ["ppt/presentation.xml", pres],
    ["ppt/_rels/presentation.xml.rels", rels([["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ["rId2", "slide", "slides/slide1.xml"], ["rId3", "slide", "slides/slide2.xml"], ["rId4", "slide", "slides/slide3.xml"]])],
    ["ppt/slideMasters/slideMaster1.xml", master],
    ["ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "theme", "../theme/theme1.xml"]])],
    ["ppt/slideLayouts/slideLayout1.xml", layout],
    ["ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]])],
    ["ppt/theme/theme1.xml", theme],
    ["ppt/slides/slide1.xml", slide1],
    ["ppt/slides/slide2.xml", slide2],
    ["ppt/slides/slide3.xml", slide3],
    ["ppt/slides/_rels/slide1.xml.rels", rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"]])],
    ["ppt/slides/_rels/slide2.xml.rels", rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "image", "../media/image1.png"], ["rId3", "image", "https://example.invalid/tracker.png", true]])],
    ["ppt/slides/_rels/slide3.xml.rels", rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"]])],
    ["ppt/media/image1.png", PNG],
  ];
}
function zipOf(files) {
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts = [], central = [];
  let at = 0;
  for (const [name, text] of files) {
    const n = Buffer.from(name), d = Buffer.isBuffer(text) ? text : Buffer.from(text), c = crc(d);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(c, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    const e = Buffer.alloc(46); e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt32LE(c, 16); e.writeUInt32LE(d.length, 20); e.writeUInt32LE(d.length, 24); e.writeUInt16LE(n.length, 28); e.writeUInt32LE(at, 42);
    parts.push(h, n, d); central.push(e, n);
    at += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...parts, cd, end]);
}

const pptxBytes = () => zipOf(pptxFiles());
module.exports = { pptxFiles, pptxBytes, zipOf };
if (require.main === module) require("fs").writeFileSync(process.argv[2] || "deck.pptx", pptxBytes());

