import sys
from pathlib import Path
import torch
import timm

ROOT = Path(__file__).parent.resolve()
SNAPSHOT_DIR = ROOT / "models--BVRA--resnext50_32x4d.in1k_ft_fungitastic-mini_224/snapshots/90ea9317dcba42ddbb101c0b4054c0dd8980ea0f"

# Download from HF Hub if not cached locally
if not SNAPSHOT_DIR.exists():
    print("Downloading BVRA model from Hugging Face Hub...")

# timm will load from local cache or download from HF automatically via hf-hub
model = timm.create_model(
    "hf-hub:BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224",
    pretrained=True,
    num_classes=215,
)
model.eval()

dummy_input = torch.randn(1, 3, 224, 224)

torch.onnx.export(
    model,
    dummy_input,
    ROOT / "pwa/model/fungitastic.onnx",
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

print("ONNX export complete: pwa/model/fungitastic.onnx")
