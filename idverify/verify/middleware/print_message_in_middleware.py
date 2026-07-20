def print_hello_message(request):
    print("this is hello message from the middleware")
    print("Method:", request.method)
    print("Path:", request.path)
    print("Headers:", dict(request.headers))
    print("GET params:", request.GET)
    print("POST body:", request.POST)
    print("User:", request.user)


class PrintMessageClass:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        print_hello_message(request)
        response = self.get_response(request)
        return response