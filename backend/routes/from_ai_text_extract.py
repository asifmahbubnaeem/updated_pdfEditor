import os
from google import genai
import sys
import ast

API_KEY = os.environ.get('GEMINI_API_KEY')
if not API_KEY:
    raise ValueError("GEMINI_API_KEY environment variable is not set")
client = genai.Client(api_key=API_KEY)


def write_to_a_file(str_data:str, outputPath):
    with open(f"{outputPath}/Extractedtext.txt", "w") as f:
        f.write(str_data)
        

def extract_data_from_image(inputImage):
    tbl_data=[]
    image_file = client.files.upload(file=inputImage)
    chat = client.chats.create(model="gemini-2.5-flash")
    prompt_2 = f"Extract text list from image, do not add any extra chars or comment."#"extract the same table as a python list."
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
    # print(str_data)
    write_to_a_file(str_data, outputPath)
    

