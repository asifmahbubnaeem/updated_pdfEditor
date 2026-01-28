import os
from google import genai
import sys

import csv
import copy
import json
import pandas as pd
from csv2pdf import convert
import xml.etree.ElementTree as ET

import ast

API_KEY = os.environ.get('GEMINI_API_KEY')
if not API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is not set")
client = genai.Client(api_key=API_KEY)
DELIMITER='__del::mtr__'

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


def replaceNoneOrEmpty(data:list):
    if data is None:
        return data
    row = [f"Empty_val_{idx}" if not item else item for idx,item in enumerate(data)]
    return row


def replaceSpecialChars(dList:list):

    try:
        chars_to_replace=[' ', '/', '\\','\n','(',')','*','+','-','=' ]
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



def convert_to_excel(data, outputPath):
    for i,table in enumerate(data):

        tmp = copy.deepcopy(table)

        headers = tmp[0]
        rows = tmp[1:]

        df_tabular = pd.DataFrame(rows, columns=headers)

        df_tabular.to_excel(f"{outputPath}/table_{i+1}.xlsx",index=False)

def extract_data_from_image(inputImage):
    tbl_data=[]
    image_file = client.files.upload(file=inputImage)
    chat = client.chats.create(model="gemini-2.5-flash")
    prompt_2 = f"Extract table as list from image, do not add any extra chars or comment. If more than one table, append with delimiter {DELIMITER}"#"extract the same table as a python list."
    response_2 = chat.send_message(
        [prompt_2, image_file]
    )
    tbl_data=response_2.text
    client.files.delete(name=image_file.name)
    return tbl_data



if __name__== "__main__":
    inputImage = sys.argv[1]
    outputPath = sys.argv[2]
    outputFormat = sys.argv[3]
    str_data = extract_data_from_image(inputImage)
    print(str_data)
    table_data = str_data.split(DELIMITER)
    data=[]
    try:
        for tbl in table_data:
            data.append(ast.literal_eval(tbl))
    except ValueError as e:
        print(f"Error converting string to list: {e}")
  

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

