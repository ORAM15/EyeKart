import os
import re

def analyze_code_html(base_path):
    dirs = [d for d in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, d))]
    report = []
    
    for d in sorted(dirs):
        code_html_path = os.path.join(base_path, d, "code.html")
        if not os.path.exists(code_html_path):
            report.append(f"Directory: {d}\n  No code.html found.\n")
            continue
            
        with open(code_html_path, "r", encoding="utf-8") as f:
            content = f.read()
            
            # Extract title
            title_match = re.search(r'<title>(.*?)</title>', content, re.IGNORECASE)
            title_text = title_match.group(1) if title_match else "No Title"
            
            # Interactive elements counts
            buttons = len(re.findall(r'<button\b', content, re.IGNORECASE))
            forms = len(re.findall(r'<form\b', content, re.IGNORECASE))
            links = len(re.findall(r'<a\b', content, re.IGNORECASE))
            inputs = len(re.findall(r'<(input|select|textarea)\b', content, re.IGNORECASE))
            
            # JS hooks / data bindings
            data_bindings = set(re.findall(r'data-[a-zA-Z0-9\-]+', content))
            ids = set(re.findall(r'\bid=["\']([^"\']+)["\']', content))
            onclicks = set(re.findall(r'\bonclick=["\']([^"\']*)["\']', content))
            
            # Dead interactions
            dead_hrefs = set(re.findall(r'href=["\'](#|javascript:void[^"\']*)["\']', content))
            dead_onclicks = set(re.findall(r'onclick=["\'](javascript:void[^"\']*|)["\']', content))
            
            report.append(f"Directory: {d}")
            report.append(f"  Page/Component: {title_text}")
            report.append(f"  Interactive Elements: {buttons} buttons, {forms} forms, {links} links, {inputs} inputs")
            report.append(f"  Data Bindings: {', '.join(sorted(data_bindings)[:10])}{'...' if len(data_bindings)>10 else ''}")
            report.append(f"  IDs (JS Hooks?): {', '.join(sorted(ids)[:10])}{'...' if len(ids)>10 else ''}")
            report.append(f"  Onclicks: {', '.join(sorted(onclicks)[:10])}{'...' if len(onclicks)>10 else ''}")
            
            if dead_hrefs:
                report.append(f"  Dead Hrefs: {', '.join(dead_hrefs)}")
            if dead_onclicks:
                report.append(f"  Empty/Void Onclicks: {', '.join(dead_onclicks)}")
            report.append("")
            
    with open("d:\\BRDR\\Development\\Active Projects\\EyeKart\\report.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(report))

analyze_code_html("d:\\BRDR\\Development\\Active Projects\\EyeKart\\Stitch\\stitch_eyekart_optical_commerce_platform")
