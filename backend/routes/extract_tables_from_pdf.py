import sys
import csv
import copy
from pdf2docx import Converter
import json
import pandas as pd
import xml.etree.ElementTree as ET
from csv2pdf import convert
import pdfplumber
from pdf2image import convert_from_path
import pytesseract
import fitz
import os



def is_scanned(pdf_path):
    doc = fitz.open(pdf_path)
    for page in doc:
        text = page.get_text().strip()
        if text:
            return False
    return True


def autofix(table):
    max_cols = max(len(row) for row in table if row)  # detect max columns
    fixed_table = []
    for row in table:
        if not row:
            continue
        tmp_row = [item if item is not None else '' for item in row]
        fixed_row = tmp_row + [""] * (max_cols - len(tmp_row))
        fixed_table.append(fixed_row)
    return fixed_table

def replaceNoneOrEmpty(data:list):
    if data is None:
        return data
    row = [f"Empty_val_{idx}" if not item else item for idx,item in enumerate(data)]
    return row


def replaceSpecialChars(dList:list):

    try:
        chars_to_replace=[' ', '/', '\\','\n' ]
        replacement_char = '_'
        output=[]
        for item in dList:

            translation_table = str.maketrans(''.join(chars_to_replace), replacement_char * len(chars_to_replace))
            tmp = item.translate(translation_table)
            output.append(tmp)
        return replaceNoneOrEmpty(output)
    except TypeError as te:
        print(f"Type error occurred as: {te}")
    except Exception as e:
        print(f"Error is: {e}")


def extract_table(input_pdf):
    tables=[]

    if not is_scanned(input_pdf):
        # DIGITAL PDF
        print("not scanned")
        with pdfplumber.open(input_pdf) as pdf:
            for i, page in enumerate(pdf.pages):
                # Extract text
                # text = page.extract_text() or ""
                # Extract tables
                tbls = page.extract_tables(
                    {
                        "vertical_strategy": "lines",      # use detected vertical lines
                        "horizontal_strategy": "lines",    # use detected horizontal lines
                        "snap_tolerance": 3,               # reduce merging errors
                        "join_tolerance": 3,
                        "edge_min_length": 3,
                    })
                for j, table in enumerate(tbls):
                    fixed_table = autofix(table)
                    # print(fixed_table)
                    tables.append(fixed_table)

    else:
        # SCANNED PDF
        print("its scanned")
        pages = convert_from_path(input_pdf, dpi=500)
        text_out = []
        for i, page in enumerate(pages):
            text = pytesseract.image_to_string(page, lang="eng")
            text_out.append(text)

        # Table detection (basic OCR bounding boxes)
        for i, page in enumerate(pages):
            data = pytesseract.image_to_data(page, output_type=pytesseract.Output.DATAFRAME)
            tables.append(data)

    return tables

def convert_to_csv(data, outputPath):
    table_names=[]
    for i,table in enumerate(data):

        tmp = copy.deepcopy(table)
        with open(f"{outputPath}/table_{i+1}.csv", "w") as f:
            writer = csv.writer(f)
            table_names.append(f"{outputPath}/table_{i+1}.csv")
            for j, row in enumerate(tmp):
                writer.writerow(row)
    return table_names


def convert_to_text(data, outputPath):
    for i,table in enumerate(data):
        tmp = copy.deepcopy(table)
        separator=','
        stringify_str = ""
        for row in tmp:
            stringify_str += separator.join(str(row))
        with open(f"{outputPath}/table_{i+1}.txt", "w") as f:
            f.write(''.join(stringify_str))
        

def convert_to_pdf(data, outputPath):
    table_names = convert_to_csv(data, outputPath)

    for i,csvtable in enumerate(table_names):
        pdf_table_name = f"{outputPath}/table_{i+1}.pdf"
        convert(csvtable, pdf_table_name)

def formHTMLRow(tableRow):
    start_str = "<tr>"
    end_str = "</tr>"
    tmp_str = ""
    rows = ""
    for item in tableRow:
        tmp_str = "<td>"+str(item)+"</td>"
        rows +=tmp_str
    return start_str+rows+end_str


def convert_to_html(data, outputPath):
    print("convert to html")
    for i,table in enumerate(data):
        tmp = copy.deepcopy(table)
        table_start="<table>"
        table_end="</table>"
        table_rows=""
        for j,row in enumerate(tmp):
            table_rows+=formHTMLRow(row)

        complete_html_table=table_start+table_rows+table_end

        with open(f"{outputPath}/table_{i+1}.html", 'w') as ff:
            ff.write(complete_html_table)


def convert_to_json(data, outputPath):
    for i,table in enumerate(data):
        tmp = copy.deepcopy(table)
        header = tmp[0]
        tmp_header = [f"Empty_header_{index}" if not item else item for index,item in enumerate(header)]
        header = tmp_header
        rows = tmp[1:]
        list_of_dicts = [dict(zip(header, row)) for row in rows]

    with open(f"{outputPath}/table_{i+1}.json", mode='w', encoding='utf-8') as f:
        json.dump(list_of_dicts, f, indent=4)



def convert_to_excel(data, outputPath):
    for i,table in enumerate(data):

        tmp = copy.deepcopy(table)

        headers = tmp[0]
        rows = tmp[1:]

        df_tabular = pd.DataFrame(rows, columns=headers)

        df_tabular.to_excel(f"{outputPath}/table_{i+1}.xlsx",index=False)



def convert_to_xml(data, outputPath):

    for i,table in enumerate(data):

        tmp = copy.deepcopy(table)
        headers = tmp[0]
        headers = replaceSpecialChars(headers)
        rows = tmp[1:]

        root = ET.Element("datasource")

        for row in rows:
            item_element = ET.SubElement(root, "record")

            for header_name, value in zip(headers, row):
                child_element = ET.SubElement(item_element, header_name)
                child_element.text = value

        tree = ET.ElementTree(root)

        try:
            tree.write(f"{outputPath}/table_{i+1}.xml", encoding="utf-8", xml_declaration=True)
        except Exception as e:
            print(f"An error occurred: {e}")


if __name__== "__main__":
    inputPdf = sys.argv[1]
    outputPath = sys.argv[2]
    outputFormat = sys.argv[3]
    data = extract_table(inputPdf)

    if 'csv' in outputFormat:
        convert_to_csv(data, outputPath)
    elif 'html' in outputFormat:
        convert_to_html(data, outputPath)
    elif 'json' in outputFormat:
        convert_to_json(data, outputPath)
    elif 'txt' in outputFormat:
        convert_to_text(data, outputPath)
    elif 'xlsx' in outputFormat:
        convert_to_excel(data, outputPath)
    elif 'xml' in outputFormat:
        convert_to_xml(data, outputPath)
    elif 'pdf' in outputFormat:
        convert_to_pdf(data, outputPath)
        # return


    # extract_table("/Users/Asif.Mahbub/Downloads/resm.pdf")