from django.shortcuts import render

from django.http import HttpResponse
import os
from django.conf import settings

def index(request):
    index_path = os.path.join(settings.BASE_DIR, 'frontend', 'dist', 'index.html')
    with open(index_path, 'r', encoding='utf-8') as f:
        return HttpResponse(f.read(), content_type='text/html')