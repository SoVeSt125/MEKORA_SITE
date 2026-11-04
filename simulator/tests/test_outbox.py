import httpx
from simulator.__main__ import Outbox


def test_outbox_survives_restart_and_idempotent_retry(tmp_path):
    path = tmp_path/'outbox.db'
    outbox = Outbox(path)
    payload = {'measurement_id':'packet-1','device_id':'device-1','sequence_number':7}
    outbox.enqueue(payload)
    outbox.db.close()
    recovered = Outbox(path)
    assert recovered.next_sequence({'id':'device-1','next_sequence':2}) == 8
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(200,json={'duplicate':True})
    with httpx.Client(base_url='http://test',transport=httpx.MockTransport(respond)) as client:
        recovered.flush(client)
    assert len(calls) == 1
    assert recovered.db.execute('SELECT count(*) FROM outbox').fetchone()[0] == 0
    recovered.db.close()
