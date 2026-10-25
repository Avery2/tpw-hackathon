#!/usr/bin/env python3
"""Compile the additional-forms policy into standalone Apps Script configuration.

Standard library only; no network or workbook access. Run with --check in CI to
check byte-for-byte parity without writing. New kinds declare a contract path and
source kind in additional_forms.json; an optional per-kind schema overrides the
source contract's schema. Field overrides add/override validation properties;
include_sheet_buckets adds the photo template's demographic count fields.
Never reads or modifies the existing guided-quarterly receiver.
"""
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "data/intake/additional_forms.json"
OUTPUT = ROOT / "admin/additional-forms/Config.gs"
IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]{0,79}$")
RESERVED_FIELDS = {"id", "kind", "schema", "source", "submitted_at", "__proto__", "constructor", "prototype"}
FIELD_KEYS = {"type", "required", "min", "max", "max_items", "max_length", "options", "show_if", "format"}
UI_KEYS = {"key", "label", "datalist", "placeholder", "help", "half", "hidden"}
TYPES = {"text", "textarea", "integer", "date", "facility", "facilities", "select", "choice", "list"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def keys(value, allowed, where):
    require(isinstance(value, dict), where + " must be an object")
    require(not (set(value) - allowed), where + ": unknown keys " + repr(sorted(set(value) - allowed)))


def text(value, where):
    require(isinstance(value, str) and bool(value.strip()) and value == value.strip(), where + " must be nonempty text")
    return value


def identifier(value, where):
    require(isinstance(value, str) and IDENTIFIER.fullmatch(value) and value not in RESERVED_FIELDS, where + " is not a safe identifier")
    return value


def strings(value, where):
    require(isinstance(value, list) and bool(value), where + " must be a nonempty array")
    for item in value:
        text(item, where)
    require(len(value) == len(set(value)), where + " must be unique")
    return value


def load(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "Duplicate JSON key: " + key)
            result[key] = value
        return result
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique)


def source(path):
    text(path, "source path")
    resolved = (ROOT / path).resolve()
    require(not Path(path).is_absolute() and resolved.is_relative_to(ROOT) and resolved.suffix == ".json", "Source must be a repository JSON file")
    return load(resolved)


def field(spec, formats, where):
    keys(spec, FIELD_KEYS, where)
    kind = spec.get("type")
    require(isinstance(kind, str) and kind in TYPES, where + ": unsupported field type " + repr(kind))
    if "required" in spec:
        require(type(spec["required"]) is bool, where + ": required must be boolean")
    permitted = {"type", "required", "show_if"}
    if kind in {"text", "textarea"}:
        permitted |= {"max", "format"}
    elif kind == "integer":
        permitted |= {"min", "max"}
        require("max" in spec, where + ": integer needs max")
    elif kind == "list":
        permitted |= {"max_items", "max_length", "format"}
        require({"max_items", "max_length"} <= spec.keys(), where + ": list needs limits")
    elif kind in {"select", "choice"}:
        permitted.add("options")
        strings(spec.get("options"), where + ".options")
    require(set(spec) <= permitted, where + ": properties incompatible with field type")
    for prop in {"min", "max", "max_items", "max_length"} & spec.keys():
        require(type(spec[prop]) is int and 0 <= spec[prop] <= 1000000, where + ": invalid " + prop)
    if "min" in spec and "max" in spec:
        require(spec["min"] <= spec["max"], where + ": min exceeds max")
    if "format" in spec:
        require(isinstance(spec["format"], str) and (spec["format"] in formats or spec["format"] == "sheetTemplate"), where + ": unknown format")
    if "show_if" in spec:
        require(isinstance(spec["show_if"], dict) and bool(spec["show_if"]), where + ": invalid show_if")
        for key, value in spec["show_if"].items():
            identifier(key, where + ".show_if")
            require(type(value) in {str, int, bool} and (not isinstance(value, str) or bool(value)), where + ": invalid show_if value")
    return spec


def contract_fields(form):
    keys(form, {"kind", "label", "title", "blurb", "submit", "tab", "fields"}, "contract form")
    require(isinstance(form.get("fields"), list), "Contract fields must be an array")
    result = {}
    for raw in form["fields"]:
        keys(raw, FIELD_KEYS | UI_KEYS | {"items"}, "contract field")
        key = identifier(raw.get("key"), "contract field key")
        if raw.get("type") == "counts":
            require(set(raw) <= UI_KEYS | {"type", "max", "items"}, "Unsupported counts property")
            require(isinstance(raw.get("items"), list) and raw["items"], "counts needs items")
            for item in raw["items"]:
                keys(item, {"key", "label"}, "count item")
                name = identifier(item.get("key"), "count item key")
                require(name not in result, "Duplicate field: " + name)
                result[name] = {"type": "integer", "min": 0, "max": raw.get("max")}
        else:
            require("items" not in raw, "items only supported for counts")
            require(key not in result, "Duplicate field: " + key)
            spec = {k: v for k, v in raw.items() if k in FIELD_KEYS}
            if "options" in spec:
                require(isinstance(spec["options"], list), "options must be an array")
                values = []
                for option in spec["options"]:
                    if isinstance(option, dict):
                        keys(option, {"value", "label"}, "option")
                        option = option.get("value")
                    values.append(option)
                spec["options"] = values
            result[key] = spec
    return result


def build(policy=None):
    policy = load(POLICY) if policy is None else policy
    keys(policy, {"schema", "service", "version", "facilities", "sheets", "formats", "forms"}, "policy")
    require(policy.get("schema") == "tpw.additional-forms/1", "Unsupported policy schema")
    text(policy.get("service"), "service")
    require(type(policy.get("version")) is int and policy["version"] > 0, "version must be a positive integer")
    formats = policy.get("formats")
    require(isinstance(formats, dict), "formats must be an object")
    for name, pattern in formats.items():
        require(re.fullmatch(r"[A-Za-z][A-Za-z0-9]{0,39}", name) and name != "sheetTemplate", "Invalid format name")
        text(pattern, "format regex")
        require(pattern.startswith("^") and pattern.endswith("$") and len(pattern) <= 500, "Format regex must be bounded and anchored")
        re.compile(pattern)
    facilities_doc = source(policy.get("facilities"))
    require(isinstance(facilities_doc.get("facilities"), list), "Missing facilities")
    facilities = strings([item["name"] for item in facilities_doc["facilities"]], "facilities")
    sheets = source(policy.get("sheets"))
    require(isinstance(sheets.get("forms"), list), "Missing sheet forms")
    templates = strings([item["id"] for item in sheets["forms"]], "templates")
    buckets = []
    for sheet in sheets["forms"]:
        for group in sheet["groups"]:
            require(isinstance(group["buckets"], list), "Sheet buckets must be an array")
            for bucket in group["buckets"]:
                identifier(bucket, "sheet bucket")
                if bucket not in buckets:
                    buckets.append(bucket)
    forms = policy.get("forms")
    require(isinstance(forms, dict) and bool(forms), "forms must be a nonempty object")
    output = {}
    tabs = set()
    for kind, entry in forms.items():
        identifier(kind, "form kind")
        keys(entry, {"tab", "contract", "schema", "sources", "include_sheet_buckets", "fields", "rules"}, kind)
        tab = text(entry.get("tab"), kind + ".tab")
        require(re.fullmatch(r"[A-Za-z][A-Za-z0-9 _-]{0,79}", tab), "Unsafe or overlong tab title: " + tab)
        folded = tab.casefold()
        require(not folded.startswith("submissions") and folded not in {"members", "constants", "data entry sheet"} and not folded.startswith("form responses"), "Reserved guided/workbook tab: " + tab)
        require(folded not in tabs, "Duplicate tab title: " + tab)
        tabs.add(folded)
        ref = entry.get("contract")
        keys(ref, {"path", "kind"}, kind + ".contract")
        identifier(ref.get("kind"), "source kind")
        contract = source(ref.get("path"))
        keys(contract, {"schema", "note", "forms"}, "source contract")
        require(isinstance(contract.get("forms"), list), "Contract forms must be an array")
        matches = [f for f in contract["forms"] if f.get("kind") == ref["kind"]]
        require(len(matches) == 1, "Contract must contain exactly one source kind: " + ref["kind"])
        fields = contract_fields(matches[0])
        if "include_sheet_buckets" in entry:
            require(type(entry["include_sheet_buckets"]) is bool, "include_sheet_buckets must be boolean")
        if entry.get("include_sheet_buckets"):
            maximum = fields.get("present_count", {}).get("max")
            require(type(maximum) is int, "Photo buckets need present_count max")
            for bucket in buckets:
                require(bucket not in fields, "Photo bucket collides with contract: " + bucket)
                fields[bucket] = {"type": "integer", "min": 0, "max": maximum}
        overrides = entry.get("fields", {})
        require(isinstance(overrides, dict), "fields must be an object")
        for name, spec in overrides.items():
            identifier(name, "override field")
            keys(spec, FIELD_KEYS, "override " + name)
            fields[name] = dict(fields.get(name, {}), **spec)
        require(fields.get("org", {}).get("type") == "text" and fields["org"].get("required") is True, kind + " requires org text")
        for name, spec in fields.items():
            field(spec, formats, kind + "." + name)
            for dependency, expected in spec.get("show_if", {}).items():
                require(dependency in fields and dependency != name, "Unknown/self show_if dependency")
                if fields[dependency].get("options"):
                    require(expected in fields[dependency]["options"], "Unknown show_if option")
        rules = entry.get("rules", [])
        require(isinstance(rules, list), "rules must be an array")
        for rule in rules:
            keys(rule, {"type", "field", "of"}, "rule")
            require(rule.get("type") in {"subset", "count", "lte"}, "Unknown rule type")
            require(rule.get("field") in fields and rule.get("of") in fields, "Unknown rule field")
            left, right = fields[rule["field"]]["type"], fields[rule["of"]]["type"]
            expected = {"subset": ("list", "list"), "count": ("integer", "list"), "lte": ("integer", "integer")}[rule["type"]]
            require((left, right) == expected, "Rule field types do not match")
        output[kind] = {"tab": tab, "schema": text(entry.get("schema", contract.get("schema")), "record schema"), "sources": strings(entry.get("sources"), kind + ".sources"), "fields": fields, "rules": rules}
    return {"schema": policy["schema"], "service": policy["service"], "version": policy["version"], "forms": output, "facilities": facilities, "templates": templates, "formats": formats}


def render(config):
    return ("// Generated by scripts/build_additional_forms.py; DO NOT EDIT.\n"
            "// Policy: data/intake/additional_forms.json. Standalone project only.\n"
            "var ADDITIONAL_FORMS_CONFIG_ = " + json.dumps(config, ensure_ascii=True, indent=2, allow_nan=False) + ";\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if generated Config.gs differs; do not write")
    args = parser.parse_args()
    try:
        content = render(build()).encode("utf-8")
        if args.check:
            require(OUTPUT.exists() and OUTPUT.read_bytes() == content, "Config.gs is stale; run python3 scripts/build_additional_forms.py")
            print("Additional-forms configuration is current.")
        else:
            OUTPUT.parent.mkdir(parents=True, exist_ok=True)
            OUTPUT.write_bytes(content)
            print("Wrote " + str(OUTPUT.relative_to(ROOT)))
    except (ValueError, TypeError, KeyError, OSError) as exc:
        print("Additional-forms configuration: " + str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
