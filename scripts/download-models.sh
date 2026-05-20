: ""
# Download ONNX models from Hugging Face Hub
# Run this before `npm run build`
#
# Usage:
#   ./scripts/download-models.sh       # downloads to pwa/model/
#   ./scripts/download-models.sh dist  # downloads to dist/model/ (for CI)

set -e

DEST="${1:-pwa/model}"
mkdir -p "$DEST"

echo "Downloading ForagerFlow models..."
echo "  → $DEST"

# BVRA Specialist model (ResNeXt50, ~90 MB)
if [ ! -f "$DEST/fungitastic.onnx" ]; then
    echo "  -> fungitastic.onnx (BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224)"
    wget -q "https://huggingface.co/BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224/resolve/main/model.onnx" \
        -O "$DEST/fungitastic.onnx" || echo "    ⚠️  BVRA model not available as direct ONNX download"
fi

# Dima806 Generalist model (~330 MB)
if [ ! -f "$DEST/dima806.onnx" ]; then
    echo "  -> dima806.onnx (dima806/mushrooms_image_detection)"
    wget -q "https://huggingface.co/dima806/mushrooms_image_detection/resolve/main/model.onnx" \
        -O "$DEST/dima806.onnx" || echo "    ⚠️  dima806 model not available as direct ONNX download"
fi

echo "Done."
echo ""
echo "If direct ONNX downloads aren't available, export locally:"
echo "  python3 export_bvra_onnx.py      # requires timm + torch"
echo "  python3 export_dima806_onnx.py   # requires transformers + torch"
"