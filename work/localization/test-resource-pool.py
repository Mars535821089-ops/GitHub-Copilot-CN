import unittest
try:
 from resource_pool import allocate
except ImportError:
 def allocate(items,slots):return {}
class ResourcePoolTest(unittest.TestCase):
 def test_assigns_payloads_without_overlap(self):
  a=allocate({'one':b'x'*8,'two':b'y'*5},[(100,10),(120,6)])
  self.assertEqual(a,{'one':100,'two':120})
 def test_reuses_leftover_only_inside_available_payload_slots(self):
  a=allocate({'one':b'x'*6,'two':b'y'*4},[(100,10)])
  self.assertEqual(a,{'one':100,'two':106})
 def test_rejects_overflow_instead_of_changing_other_binary_regions(self):
  with self.assertRaises(ValueError):allocate({'one':b'x'*20},[(100,10)])
if __name__=='__main__':unittest.main()
