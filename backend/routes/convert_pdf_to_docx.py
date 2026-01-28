import sys
from pdf2docx import Converter

def convert(pdf_file, docx_file):
    cv = Converter(pdf_file)
    cv.convert(docx_file, start=0, end=None)  # full document
    cv.close()

if __name__ == "__main__":
    pdf_path = sys.argv[1]
    docx_path = sys.argv[2]
    convert(pdf_path, docx_path)
