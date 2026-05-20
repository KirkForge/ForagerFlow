import json
import sys
from pathlib import Path
import torch

ROOT = Path(__file__).parent.resolve()
SNAPSHOT_DIR = ROOT / "models--blasisd--musheff/snapshots/465fd5f60b6427889a3197916531df078e9ead27"
sys.path.insert(0, str(SNAPSHOT_DIR))
from model import Musheff

with open(SNAPSHOT_DIR / "config.json", "r") as f:
    config = json.load(f)

model = Musheff(config)
state_dict = torch.load(SNAPSHOT_DIR / "musheff.pth", map_location="cpu", weights_only=True)
model.model.load_state_dict(state_dict)
model.eval()

dummy_input = torch.randn(1, 3, 300, 300)

torch.onnx.export(
    model,
    dummy_input,
    ROOT / "pwa/model/musheff.onnx",
    export_params=True,
    opset_version=14,
    do_constant_folding=True,
    input_names=["pixel_values"],
    output_names=["logits"],
    dynamic_axes={
        "pixel_values": {0: "batch_size"},
        "logits": {0: "batch_size"},
    },
)

print("ONNX export complete: pwa/model/musheff.onnx")
