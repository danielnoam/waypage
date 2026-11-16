import sys, struct, lzma, zlib, base64, os
from libzim.writer import Creator, Item, StringProvider, Hint
out = sys.argv[1]
def png(r,g,b,w=40,h=30):
    raw=b''.join(b'\x00'+bytes([r,g,b])*w for _ in range(h))
    def ch(t,d): return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+ch(b'IDAT',zlib.compress(raw))+ch(b'IEND',b'')
def page(title, body, img=None, pre=""):
    im = f'<figure><img src="{pre}I/{img}" width="40" height="30" alt="{title} picture"><figcaption>A picture of {title.lower()}.</figcaption></figure>' if img else ''
    return f'<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><link rel="stylesheet" href="{pre}-/style.css"><script src="{pre}-/x.js"></script></head><body><h1>{title}</h1>{im}{body}</body></html>'
arts = {
 "Lighthouse": ("Lighthouse", '<p>A <b>lighthouse</b> is a tower that guides ships. See <a href="Tide">tides</a> and <a href="Ship#Hulls">ship hulls</a>, or <a href="https://en.wikipedia.org/wiki/Fresnel_lens">the Fresnel lens</a> online.</p><h2 id="History">History</h2><p>The first lighthouses were fires on hills.</p>', "light.png"),
 "Tide": ("Tide", '<p>A <b>tide</b> is the rise and fall of the sea. Back to the <a href="Lighthouse">lighthouse</a>.</p>', "tide.png"),
 "Ship": ("Ship", '<p>A ship is a large boat.</p>' + ''.join(f'<p>Paragraph {i} about ships and the sea, long enough to scroll a little.</p>' for i in range(30)) + '<h2 id="Hulls">Hulls</h2><p>The hull is the body of a ship. <a href="Main_Page">Main page</a>.</p>', None),
 "Main_Page": ("Main Page", '<p>Welcome to the test pack. Read about the <a href="Lighthouse">Lighthouse</a>, <a href="Tide">Tide</a> or <a href="Ship">Ship</a>.</p>', None),
 "Lightning": ("Lightning", '<p>Lightning is an electric discharge. Not a <a href="Lighthouse">lighthouse</a>.</p>', None),
}
meta = {"Title":"Test Wikipedia","Description":"A small pack for Waypage's tests","Language":"eng","Creator":"Wikipedia","Publisher":"Kiwix","Name":"wikipedia_en_test","Date":"2026-11-01","Source":"en.wikipedia.org"}
imgs = {"light.png":png(230,180,40),"tide.png":png(40,90,200)}
icon = png(10,120,60,48,48)
mode = sys.argv[2]
if mode == "new":
    class It(Item):
        def __init__(s,path,title,mime,data,front=False): super().__init__(); s.p,s.t,s.m,s.d,s.f=path,title,mime,data,front
        def get_path(s): return s.p
        def get_title(s): return s.t
        def get_mimetype(s): return s.m
        def get_contentprovider(s): return StringProvider(s.d)
        def get_hints(s): return {Hint.FRONT_ARTICLE: s.f, Hint.COMPRESS: s.m.startswith("text")}
    with Creator(out).config_indexing(False, "eng") as c:
        c.set_mainpath("Main_Page")
        for p,(t,b,i) in arts.items(): c.add_item(It(p,t,"text/html",page(t,b,i).encode(),True))
        for n,d in imgs.items(): c.add_item(It("I/"+n,"","image/png",d))
        c.add_item(It("-/style.css","","text/css",b"body{color:red}"))
        c.add_redirection("Lighthouses","Lighthouses","Lighthouse",{Hint.FRONT_ARTICLE: True})
        for k,v in meta.items(): c.add_metadata(k,v)
        c.add_metadata("Illustration_48x48@1", icon)
else:
    # Old format (5.0, namespaces), clusters xz, written by hand.
    ents=[]  # (ns,url,title,mime,data or redirect target)
    for p,(t,b,i) in arts.items(): ents.append(("A",p,t,"text/html",page(t,b,i,"../").encode()))
    for n,d in imgs.items(): ents.append(("I",n,"","image/png",d))
    ents.append(("-","style.css","","text/css",b"body{color:red}"))
    for k,v in meta.items(): ents.append(("M",k,"","text/plain",v.encode()))
    ents.append(("M","Illustration_48x48@1","","image/png",icon))
    ents.append(("A","Lighthouses","Lighthouses",None,("A","Lighthouse")))
    ents.sort(key=lambda e:(e[0],e[1].encode()))
    mimes=sorted({e[3] for e in ents if e[3]})
    # cluster 0: text, xz; cluster 1: images, stored
    cl=[[],[]]
    for e in ents:
        if e[3] is None: continue
        k=0 if e[3].startswith("text") else 1
        cl[k].append(e)
    where={}
    blobs=[]
    for ci,c in enumerate(cl):
        data=[e[4] for e in c]
        for bi,e in enumerate(c): where[(e[0],e[1])]=(ci,bi)
        offs=[]; o=4*(len(data)+1)
        for d in data: offs.append(o); o+=len(d)
        offs.append(o)
        body=b''.join(struct.pack('<I',x) for x in offs)+b''.join(data)
        if ci==0: blobs.append(b'\x04'+lzma.compress(body,format=lzma.FORMAT_XZ,check=lzma.CHECK_CRC64))
        else: blobs.append(b'\x01'+body)
    idx={(e[0],e[1]):i for i,e in enumerate(ents)}
    dirents=[]
    for e in ents:
        if e[3] is None:
            d=struct.pack('<HBcI',0xffff,0,e[0].encode(),0)+struct.pack('<I',idx[e[4]])
        else:
            ci,bi=where[(e[0],e[1])]
            d=struct.pack('<HBcI',mimes.index(e[3]),0,e[0].encode(),0)+struct.pack('<II',ci,bi)
        dirents.append(d+e[1].encode()+b'\0'+e[2].encode()+b'\0')
    mimelist=b''.join(m.encode()+b'\0' for m in mimes)+b'\0'
    n=len(ents)
    pos=80
    mimepos=pos; pos+=len(mimelist)
    urlpos=pos; pos+=8*n
    titlepos=pos; pos+=4*n
    clpos=pos; pos+=8*len(blobs)
    dpos=[]
    for d in dirents: dpos.append(pos); pos+=len(d)
    cpos=[]
    for b in blobs: cpos.append(pos); pos+=len(b)
    checkpos=pos
    order=sorted(range(n),key=lambda i:(ents[i][0],(ents[i][2] or ents[i][1]).encode()))
    head=struct.pack('<IHH16sIIQQQQIIQ',72173914,5,0,b'\x11'*16,n,len(blobs),urlpos,titlepos,clpos,mimepos,idx[("A","Main_Page")],0xffffffff,checkpos)
    body=head+mimelist+b''.join(struct.pack('<Q',x) for x in dpos)+b''.join(struct.pack('<I',x) for x in order)+b''.join(struct.pack('<Q',x) for x in cpos)+b''.join(dirents)+b''.join(blobs)
    import hashlib
    open(out,'wb').write(body+hashlib.md5(body).digest())
