"""Build both static resume PDFs from the public HTML resume (requires reportlab).
The supplied original PDF is preserved outside the checkout.
"""
from pathlib import Path
from html.parser import HTMLParser
from html import escape
import shutil
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate,Paragraph,KeepTogether,Spacer
from reportlab.lib.enums import TA_LEFT

ROOT=Path(__file__).resolve().parents[2]
class ResumeParser(HTMLParser):
    def __init__(self):super().__init__();self.main=False;self.tag=None;self.parts=[];self.blocks=[]
    def handle_starttag(self,tag,attrs):
        if tag=='main':self.main=True
        if self.main and tag in ('h1','h2','h3','p','li'):
            self.tag=tag;self.parts=[]
    def handle_data(self,data):
        if self.tag:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag==self.tag:
            text=' '.join(''.join(self.parts).split())
            if text and text!='Download resume PDF':self.blocks.append((tag,text))
            self.tag=None;self.parts=[]
        if tag=='main':self.main=False

parser=ResumeParser();parser.feed((ROOT/'bruce-davis-resume.html').read_text())
fonts=Path('/System/Library/Fonts/Supplemental')
# Platform fonts are embedded in the PDF; substitute licensed local TTFs on other hosts.
for name,file in [('ResumeSans','Arial.ttf'),('ResumeBold','Arial Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(fonts/file)))
ink=HexColor('#20242B');accent=HexColor('#8D1828')
styles={
 'name':ParagraphStyle('Name',fontName='ResumeSans',fontSize=24,leading=26,textColor=ink,spaceAfter=1),
 'role':ParagraphStyle('Role',fontName='ResumeSans',fontSize=10,leading=12,textColor=ink,spaceAfter=1),
 'contact':ParagraphStyle('Contact',fontName='ResumeSans',fontSize=9.1,leading=11,textColor=ink,spaceAfter=5),
 'section':ParagraphStyle('Section',fontName='ResumeBold',fontSize=8.8,leading=10.5,textColor=accent,spaceBefore=5,spaceAfter=2,keepWithNext=True),
 'job':ParagraphStyle('Job',fontName='ResumeBold',fontSize=9.25,leading=10.4,textColor=ink,spaceAfter=2,keepWithNext=True),
 'meta':ParagraphStyle('Meta',fontName='ResumeSans',fontSize=9.0,leading=10.5,textColor=ink,spaceBefore=3,spaceAfter=1,keepWithNext=True),
 'body':ParagraphStyle('Body',fontName='ResumeSans',fontSize=9.25,leading=10.4,textColor=ink,spaceAfter=1),
 'bullet':ParagraphStyle('Bullet',fontName='ResumeSans',fontSize=9.25,leading=10.4,textColor=ink,leftIndent=8,firstLineIndent=-8,spaceAfter=1),
}
story=[]
for i,(tag,text) in enumerate(parser.blocks):
    text=text.replace('–','-').replace('—','-').replace('’',"'").replace('“','"').replace('”','"')
    if tag=='h1':key='name'
    elif i==1:key='role'
    elif i==2:key='contact'
    elif tag=='h2':key='section';text=text.upper()
    elif tag=='h3':key='job'
    elif tag=='li':key='bullet';text='- '+text
    elif text.startswith('- '):key='bullet'
    elif i+1<len(parser.blocks) and parser.blocks[i+1][0]=='h3':key='meta'
    else:key='body'
    safe=escape(text)
    if key=='contact':safe=safe.replace('iambrucedavis@gmail.com','<link href="mailto:iambrucedavis@gmail.com">iambrucedavis@gmail.com</link>').replace('iambrucedavis.com','<link href="https://www.iambrucedavis.com/">iambrucedavis.com</link>')
    story.append(Paragraph(safe,styles[key]))

def build(path):
    doc=SimpleDocTemplate(str(path),pagesize=(612,792),leftMargin=32,rightMargin=32,topMargin=28,bottomMargin=28,title='Bruce Davis - Technical Project Manager',author='Bruce Davis',subject='PMP-certified technical project management resume',pageCompression=1)
    doc.build(story)

build(ROOT/'bruce-davis-resume.pdf')
shutil.copyfile(ROOT/'bruce-davis-resume.pdf',ROOT/'bruce-davis-resume-ats.pdf')
print('Built both resume PDF URLs from bruce-davis-resume.html')
