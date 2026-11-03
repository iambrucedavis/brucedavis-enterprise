"""Build the optional overview from public HTML; preserve the supplied primary PDF.
Requires ReportLab. Platform fonts are embedded; the supplied original is untouched.
"""
from pathlib import Path
from html.parser import HTMLParser
from html import escape
import shutil
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, PageBreak

ROOT=Path(__file__).resolve().parents[2]
class ResumeParser(HTMLParser):
    def __init__(self):
        super().__init__();self.main=False;self.tag=None;self.parts=[];self.blocks=[]
    def handle_starttag(self,tag,attrs):
        if tag=='main':self.main=True
        if self.main and tag in ('h1','h2','h3','p','li'):
            self.tag=tag;self.parts=[]
    def handle_data(self,data):
        if self.tag:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag==self.tag:
            text=' '.join(''.join(self.parts).split())
            if text:self.blocks.append((tag,text))
            self.tag=None;self.parts=[]
        if tag=='main':self.main=False

parser=ResumeParser();parser.feed((ROOT/'bruce-davis-resume.html').read_text())
fonts=Path('/System/Library/Fonts/Supplemental')
for name,file in [('ResumeSans','Arial.ttf'),('ResumeBold','Arial Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(fonts/file)))
ink=HexColor('#20242B');accent=HexColor('#8D1828');muted=HexColor('#55514E')

def clean(text):
    return text.replace('–','-').replace('—','-').replace('’',"'").replace('“','"').replace('”','"')

def styles_for(compact):
    if compact:
        sizes={'name':(24,26,1),'role':(10,12,1),'contact':(9.1,11,5),'section':(8.8,10.5,2),'job':(9.25,10.4,2),'meta':(9,10.5,1),'body':(9.25,10.4,1),'bullet':(9.25,10.4,1)}
    else:
        sizes={'name':(25,28,4),'role':(11.5,15,4),'contact':(10.5,14,8),'section':(10.5,14,6),'job':(11.2,14.5,4),'meta':(10.5,13.5,2),'body':(11,14.2,5),'bullet':(11,14.2,4)}
    styles={}
    for key,(size,leading,after) in sizes.items():
        styles[key]=ParagraphStyle(key,fontName='ResumeBold' if key in ('section','job') else 'ResumeSans',fontSize=size,leading=leading,textColor=accent if key=='section' else ink,spaceAfter=after,spaceBefore=(5 if compact else 9) if key=='section' else ((3 if compact else 7) if key=='meta' else 0),keepWithNext=key in ('section','job','meta'),leftIndent=(8 if compact else 10) if key=='bullet' else 0,firstLineIndent=(-8 if compact else -10) if key=='bullet' else 0)
    return styles

def paragraph(text,key,styles):
    safe=escape(clean(text))
    if key=='contact':
        safe=safe.replace('iambrucedavis@gmail.com','<link href="mailto:iambrucedavis@gmail.com">iambrucedavis@gmail.com</link>').replace('iambrucedavis.com','<link href="https://www.iambrucedavis.com/">iambrucedavis.com</link>')
    return Paragraph(safe,styles[key])

def build(path,compact=False):
    styles=styles_for(compact);story=[]
    blocks = parser.blocks
    if compact:
        # The overview avoids repeating highlights that appear in role bullets.
        start = next(i for i,b in enumerate(blocks) if b[1]=='Selected delivery highlights')
        end = next(i for i,b in enumerate(blocks) if b[1]=='Core capabilities & tools')
        blocks = blocks[:start] + blocks[end:]
        cert = next(i for i,b in enumerate(blocks) if b[1]=='Certifications')
        education = next(i for i,b in enumerate(blocks) if b[1]=='Education')
        blocks = blocks[:cert] + [('h2','Certifications & education'), ('p',' | '.join(t for _,t in blocks[cert+1:education])), ('p',' | '.join(t for _,t in blocks[education+1:]))]
    for i,(tag,text) in enumerate(blocks):
        if not compact and text=='Microsoft | May 2024 - Nov 2024':
            story += [PageBreak(),paragraph(parser.blocks[0][1],'name',styles),paragraph(parser.blocks[1][1],'role',styles),paragraph(parser.blocks[2][1],'contact',styles),paragraph('PROFESSIONAL EXPERIENCE - CONTINUED','section',styles)]
        if tag=='h1':key='name'
        elif i==1:key='role'
        elif i==2:key='contact'
        elif tag=='h2':key='section';text=text.upper()
        elif tag=='h3':key='job'
        elif tag=='li':key='bullet';text='- '+text
        elif text.startswith('- '):key='bullet'
        elif i+1<len(blocks) and blocks[i+1][0]=='h3':key='meta'
        else:key='body'
        story.append(paragraph(text,key,styles))
    def footer(canvas,doc):
        if compact:return
        canvas.saveState();canvas.setFont('ResumeSans',9);canvas.setFillColor(muted)
        canvas.drawString(42,23,'Bruce Davis | Technical Project Manager')
        canvas.drawRightString(570,23,f'{doc.page} / 2');canvas.restoreState()
    margin=32 if compact else 42
    doc=SimpleDocTemplate(str(path),pagesize=(612,792),leftMargin=margin,rightMargin=margin,topMargin=28 if compact else 36,bottomMargin=28 if compact else 38,title='Bruce Davis - Technical Project Manager'+(' Overview' if compact else ' Application Resume'),author='Bruce Davis',subject='PMP-certified technical project management resume',pageCompression=1)
    doc.build(story,onFirstPage=footer,onLaterPages=footer)

shutil.copyfile(ROOT/'bruce-davis-resume.pdf',ROOT/'bruce-davis-resume-ats.pdf')
build(ROOT/'bruce-davis-resume-overview.pdf',compact=True)
print('Preserved supplied primary PDF, mirrored ATS download, and rebuilt optional overview.')
