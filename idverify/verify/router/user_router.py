from django.urls import path
from verify import views
import verify.controllers.send_message_controller as send_message_controller

urlpatterns  = [
    path('hello_world/', send_message_controller.hello_world, name='hello_world'),
    path("print_user/",send_message_controller.print_user,name="print_user"),
    path("ai_check/",send_message_controller.ai_check,name="print_user")
]