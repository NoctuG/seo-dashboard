from typing import List, Dict, Any

class Analyzer:
    def analyze(self, page_data: Dict[str, Any], status_code: int) -> List[Dict[str, Any]]:
        issues = []

        if status_code == 404:
            issues.append({'type': '404', 'severity': 'critical', 'description': 'Page not found (404)'})
            return issues # If 404, other checks might not be relevant (except broken links pointing here, which is handled at source)
        elif status_code >= 500:
            issues.append({'type': 'server_error', 'severity': 'critical', 'description': f'Server error ({status_code})'})
            return issues

        if not page_data.get('title'):
            issues.append({'type': 'missing_title', 'severity': 'warning', 'description': 'Missing title tag'})
        elif len(page_data['title']) < 10:
             issues.append({'type': 'short_title', 'severity': 'info', 'description': 'Title is too short (<10 chars)'})

        if not page_data.get('description'):
            issues.append({'type': 'missing_description', 'severity': 'warning', 'description': 'Missing meta description'})

        if not page_data.get('h1'):
            issues.append({'type': 'missing_h1', 'severity': 'warning', 'description': 'Missing H1 heading'})

        if page_data.get('images_without_alt'):
            count = len(page_data['images_without_alt'])
            issues.append({'type': 'missing_alt', 'severity': 'warning', 'description': f'{count} images missing alt text'})

        return issues
