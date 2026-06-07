import sys
from pathlib import Path
import onnx
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

# Export to an in-memory buffer first so torch.onnx.export doesn't write a
# .data sidecar. Then save with onnx.save(save_as_external_data=False) to
# produce a single monolithic .onnx. onnxruntime-web 1.25.1 cannot load
# external-data sidecars from inside a Web Worker (the sidecar URL
# resolution is broken — empty path, "Module.MountedFiles is not
# available"), so the in-browser build needs a single file.
buf_path = ROOT / "pwa/model/fungitastic.tmp.onnx"
torch.onnx.export(
    model,
    torch.randn(1, 3, 224, 224),
    buf_path,
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

# Reload with external data and re-save monolithically. This pulls the
# sidecar contents into the .onnx file itself.
loaded = onnx.load(str(buf_path), load_external_data=True)
buf_path.unlink()
# Also drop any sidecar that was written.
sidecar = ROOT / "pwa/model/fungitastic.tmp.onnx.data"
if sidecar.exists():
    sidecar.unlink()

final_path = ROOT / "pwa/model/fungitastic.onnx"
onnx.save(loaded, str(final_path), save_as_external_data=False)
print(f"ONNX export complete (monolithic): {final_path}  ({final_path.stat().st_size} bytes)")
