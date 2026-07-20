from django.shortcuts import render
import json
import os
import uuid
import traceback

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from deepface import DeepFace
import easyocr

# ---------------------------------------------------------------------------
# easyocr.Reader loads a neural net into memory, so we don't want to create a
# new one on every request. We lazily build it once and cache it here.
# ---------------------------------------------------------------------------
_ocr_reader = None


def get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        _ocr_reader = easyocr.Reader(['en'], gpu=False)
    return _ocr_reader


@csrf_exempt
def hello_world(request):
    return JsonResponse({"message": "Hello World User"})


@csrf_exempt
@require_http_methods(["GET"])
def print_user(request):
    data = json.loads(request.body)
    name = data.get('name')
    age = data.get('age')
    return JsonResponse({"message": f"name is {name} and the age is {age}"})


def _save_upload(uploaded_file, save_dir):
    """Save an uploaded file with a random name to avoid collisions/path issues,
    while keeping the original extension."""
    ext = os.path.splitext(uploaded_file.name)[1]
    safe_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(save_dir, safe_name)
    with open(save_path, 'wb+') as destination:
        for chunk in uploaded_file.chunks():
            destination.write(chunk)
    return save_path

@csrf_exempt
@require_http_methods(["POST"])
def ai_check(request):
    id_card = request.FILES.get('id_card')
    selfie = request.FILES.get('selfie')

    if not id_card or not selfie:
        return JsonResponse(
            {"error": "Both 'id_card' and 'selfie' files are required"},
            status=400,
        )

    save_dir = os.path.join(settings.BASE_DIR, 'uploads')
    os.makedirs(save_dir, exist_ok=True)

    id_card_path = _save_upload(id_card, save_dir)
    selfie_path = _save_upload(selfie, save_dir)

    # ---------------------------------------------------------------
    # 1) Face verification: does the face on the ID match the selfie?
    # ---------------------------------------------------------------
    face_match = False
    face_error = None
    face_distance = None

    try:
        result = DeepFace.verify(
            img1_path=id_card_path,
            img2_path=selfie_path,
            model_name="Facenet512",   # good accuracy/speed tradeoff, swap if you like
            detector_backend="retinaface",
            enforce_detection=True,   # raises if a face isn't found in either image
        )
        face_match = bool(result.get("verified", False))
        face_distance = result.get("distance")
    except ValueError as e:
        # DeepFace raises ValueError when it can't find a face in one of the images
        face_error = "No face detected in one or both images"
    except Exception as e:
        face_error = str(e)
        traceback.print_exc()

    # ---------------------------------------------------------------
    # 2) OCR: extract text from the ID card
    # ---------------------------------------------------------------
    id_text = ""
    ocr_error = None

    try:
        reader = get_ocr_reader()
        ocr_results = reader.readtext(id_card_path, detail=0)  # detail=0 -> just the text strings
        id_text = "\n".join(ocr_results)
    except Exception as e:
        ocr_error = str(e)
        traceback.print_exc()

    response = {
        "face_match": face_match,
        "extracted_text": id_text,
    }

    if face_distance is not None:
        response["face_distance"] = face_distance
    if face_error:
        response["face_error"] = face_error
    if ocr_error:
        response["ocr_error"] = ocr_error

    return JsonResponse(response)