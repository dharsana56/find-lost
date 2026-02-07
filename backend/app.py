from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)
CORS(app)

vectorizer = TfidfVectorizer(
    lowercase=True,
    stop_words="english",
    ngram_range=(1, 2)
)

def compute_similarity(a, b):
    tfidf = vectorizer.fit_transform([a, b])
    return float(cosine_similarity(tfidf[0:1], tfidf[1:2])[0][0])

def confidence_label(score):
    if score >= 0.80:
        return "High confidence match"
    elif score >= 0.65:
        return "Possible match"
    return "Low confidence"

@app.route("/")
def home():
    return "Lost & Found AI Backend Running (TF-IDF)"

@app.route("/match", methods=["POST"])
def match_items():
    data = request.get_json(force=True) or {}

    lost = (data.get("lost") or "").strip()
    found = (data.get("found") or "").strip()

    if not lost or not found:
        return jsonify({"error": "Both lost and found texts are required"}), 400

    score = compute_similarity(lost, found)

    return jsonify({
        "similarity": round(score, 4),
        "similarity_percentage": round(score * 100, 2),
        "confidence": confidence_label(score)
    })

if __name__ == "__main__":
    app.run(debug=True)
