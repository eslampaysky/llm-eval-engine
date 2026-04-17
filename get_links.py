import re

def get_links(path, pat):
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()
    links = re.findall(r'<a[^>]*>', html, re.IGNORECASE)
    print(f"\n--- {path} (matching '{pat}') ---")
    for a in links:
        if pat in a.lower():
            # grab class attribute to see what it is
            m = re.search(r'class="([^"]+)"', a, re.IGNORECASE)
            c = m.group(1) if m else "NO_CLASS"
            
            # grab href
            hm = re.search(r'href="([^"]+)"', a, re.IGNORECASE)
            h = hm.group(1) if hm else "NO_HREF"
            
            # print it cleanly
            print(f"HREF: {h} | CLASS: {c}")

if __name__ == '__main__':
    get_links("gymshark.html", "products/")
    get_links("demoblaze.html", "prod.html")
