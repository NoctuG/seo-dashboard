import json
from collections import defaultdict
from datetime import datetime

from sqlmodel import Session, select

from app.models import Keyword, VisibilityHistory


class VisibilityService:
    @staticmethod
    def rank_to_visibility(rank: int | None) -> float:
        if rank is None:
            return 0.0
        if rank <= 1:
            return 1.0
        if rank <= 3:
            return 0.75
        if rank <= 10:
            return 0.4
        if rank <= 20:
            return 0.2
        if rank <= 50:
            return 0.1
        return 0.0

    def get_project_visibility(self, session: Session, project_id: int) -> dict:
        keywords = session.exec(select(Keyword).where(Keyword.project_id == project_id)).all()
        grouped_keywords: dict[str, list[Keyword]] = defaultdict(list)
        for keyword in keywords:
            group_name = (keyword.term.split()[0] if keyword.term.split() else "other").lower()
            grouped_keywords[group_name].append(keyword)

        groups = []
        all_scores = []
        for group_name, group_keywords in grouped_keywords.items():
            score = sum(self.rank_to_visibility(k.current_rank) for k in group_keywords)
            avg_score = round(score / max(len(group_keywords), 1), 4)
            groups.append({"group": group_name, "visibility_score": avg_score})
            all_scores.extend(self.rank_to_visibility(k.current_rank) for k in group_keywords)

        overall_visibility = round(sum(all_scores) / max(len(all_scores), 1), 4)

        history = session.exec(
            select(VisibilityHistory)
            .where(VisibilityHistory.project_id == project_id)
            .order_by(VisibilityHistory.checked_at.asc())
            .limit(500)
        ).all()

        trend_bucket: dict[str, list[float]] = defaultdict(list)
        feature_bucket: dict[str, int] = defaultdict(int)
        for item in history:
            date_key = item.checked_at.date().isoformat()
            trend_bucket[date_key].append(item.visibility_score)
            for feature in json.loads(item.serp_features_json):
                feature_bucket[feature] += 1

        trend = [
            {
                "date": date_key,
                "visibility_score": round(sum(scores) / len(scores), 4),
            }
            for date_key, scores in sorted(trend_bucket.items(), key=lambda kv: kv[0])
        ]

        total_history_rows = len(history)
        serp_feature_coverage = {
            k: round(v / total_history_rows, 4) if total_history_rows else 0.0
            for k, v in feature_bucket.items()
        }

        return {
            "project_id": project_id,
            "overall_visibility": overall_visibility,
            "groups": groups,
            "trend": trend,
            "serp_feature_coverage": serp_feature_coverage,
        }

    def create_visibility_row(
        self,
        *,
        project_id: int,
        keyword_id: int | None,
        keyword_term: str,
        source_domain: str,
        rank: int | None,
        result_type: str,
        serp_features: list[str],
        competitor_positions: dict,
        checked_at: datetime,
    ) -> VisibilityHistory:
        return VisibilityHistory(
            project_id=project_id,
            keyword_id=keyword_id,
            keyword_term=keyword_term,
            source_domain=source_domain,
            rank=rank,
            visibility_score=self.rank_to_visibility(rank),
            result_type=result_type,
            serp_features_json=json.dumps(serp_features, ensure_ascii=False),
            competitor_positions_json=json.dumps(competitor_positions, ensure_ascii=False),
            checked_at=checked_at,
        )


visibility_service = VisibilityService()
