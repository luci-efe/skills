class First:
    def save(self):
        return 1

class Second:
    def save(self):
        return 2

def refund_order(order):
    return Second().save()
