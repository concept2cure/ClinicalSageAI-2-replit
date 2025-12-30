#!/usr/bin/env python3
"""Plot ROC, confusion matrix and save an image to the given path."""
import csv
import sys
import numpy as np
import matplotlib.pyplot as plt
from sklearn.metrics import roc_curve, auc, confusion_matrix


def read_rows(path):
    rows = []
    with open(path, newline='') as csvfile:
        reader = csv.DictReader(filter(lambda row: not row.strip().startswith('#'), csvfile))
        for r in reader:
            rows.append(r)
    return rows


def plot_metrics(csv_path, out_path):
    rows = read_rows(csv_path)
    y_true = np.array([int(r['label']) for r in rows])
    y_score = np.array([float(r.get('score', r['predicted_label'])) for r in rows])
    pred = np.array([int(r['predicted_label']) for r in rows])

    fpr, tpr, _ = roc_curve(y_true, y_score)
    roc_auc = auc(fpr, tpr)

    fig, axes = plt.subplots(1,2, figsize=(10,4))

    # ROC
    axes[0].plot(fpr, tpr, color='darkorange', lw=2, label=f'ROC curve (area = {roc_auc:.3f})')
    axes[0].plot([0,1],[0,1], color='navy', lw=1, linestyle='--')
    axes[0].set_xlim([0.0,1.0])
    axes[0].set_ylim([0.0,1.05])
    axes[0].set_xlabel('False Positive Rate')
    axes[0].set_ylabel('True Positive Rate')
    axes[0].legend(loc='lower right')

    # Confusion matrix
    cm = confusion_matrix(y_true, pred)
    sns = None
    try:
        import seaborn as sns
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', ax=axes[1])
    except Exception:
        axes[1].imshow(cm, cmap='Blues')
        axes[1].set_xticks([0,1])
        axes[1].set_yticks([0,1])
        for (i,j), val in np.ndenumerate(cm):
            axes[1].text(j, i, str(val), ha='center', va='center', color='white')
    axes[1].set_xlabel('Predicted')
    axes[1].set_ylabel('Actual')

    fig.suptitle('Validation Metrics')
    plt.tight_layout()
    plt.savefig(out_path)
    print(f'Wrote plot to {out_path}')


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: plot_metrics.py <csv> <out.png>')
        sys.exit(2)
    plot_metrics(sys.argv[1], sys.argv[2])
