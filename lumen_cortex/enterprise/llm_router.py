"""
═══════════════════════════════════════════════════════════════════════════════
                    LLM PROVIDER ROUTER
═══════════════════════════════════════════════════════════════════════════════

Multi-provider LLM router with automatic fallback, rate limiting,
and cost optimization.

PROVIDERS:
- OpenAI (GPT-4, GPT-4-turbo, GPT-3.5)
- Anthropic (Claude 3 Opus, Sonnet, Haiku)
- Azure OpenAI
- Local models (Ollama, vLLM)

FEATURES:
- Provider failover with circuit breakers
- Rate limiting per provider
- Cost tracking
- Response caching
- Streaming support
- Structured output (JSON mode)

@module lumen_cortex.enterprise.llm_router
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
from typing import (
    Dict, Any, List, Optional, Tuple, Union,
    AsyncIterator, Callable, TypeVar
)

from .core import CircuitBreaker, CircuitState

logger = logging.getLogger("LumenCortex.LLM")


# ═══════════════════════════════════════════════════════════════════════════
#                          TYPES AND CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

class LLMProvider(Enum):
    """Supported LLM providers"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE_OPENAI = "azure_openai"
    OLLAMA = "ollama"
    MOCK = "mock"


class ModelCapability(Enum):
    """Model capabilities"""
    CHAT = auto()
    COMPLETION = auto()
    FUNCTION_CALLING = auto()
    VISION = auto()
    JSON_MODE = auto()
    STREAMING = auto()


@dataclass
class ModelInfo:
    """Information about a model"""
    provider: LLMProvider
    model_id: str
    display_name: str
    context_window: int
    max_output_tokens: int
    cost_per_1k_input: float  # USD
    cost_per_1k_output: float  # USD
    capabilities: List[ModelCapability]

    @property
    def supports_vision(self) -> bool:
        return ModelCapability.VISION in self.capabilities

    @property
    def supports_json(self) -> bool:
        return ModelCapability.JSON_MODE in self.capabilities

    @property
    def supports_streaming(self) -> bool:
        return ModelCapability.STREAMING in self.capabilities


# Model registry
MODEL_REGISTRY: Dict[str, ModelInfo] = {
    "gpt-4o": ModelInfo(
        provider=LLMProvider.OPENAI,
        model_id="gpt-4o",
        display_name="GPT-4o",
        context_window=128000,
        max_output_tokens=4096,
        cost_per_1k_input=0.005,
        cost_per_1k_output=0.015,
        capabilities=[
            ModelCapability.CHAT,
            ModelCapability.FUNCTION_CALLING,
            ModelCapability.VISION,
            ModelCapability.JSON_MODE,
            ModelCapability.STREAMING
        ]
    ),
    "gpt-4-turbo": ModelInfo(
        provider=LLMProvider.OPENAI,
        model_id="gpt-4-turbo",
        display_name="GPT-4 Turbo",
        context_window=128000,
        max_output_tokens=4096,
        cost_per_1k_input=0.01,
        cost_per_1k_output=0.03,
        capabilities=[
            ModelCapability.CHAT,
            ModelCapability.FUNCTION_CALLING,
            ModelCapability.VISION,
            ModelCapability.JSON_MODE,
            ModelCapability.STREAMING
        ]
    ),
    "gpt-3.5-turbo": ModelInfo(
        provider=LLMProvider.OPENAI,
        model_id="gpt-3.5-turbo",
        display_name="GPT-3.5 Turbo",
        context_window=16385,
        max_output_tokens=4096,
        cost_per_1k_input=0.0005,
        cost_per_1k_output=0.0015,
        capabilities=[
            ModelCapability.CHAT,
            ModelCapability.FUNCTION_CALLING,
            ModelCapability.JSON_MODE,
            ModelCapability.STREAMING
        ]
    ),
    "claude-3-opus": ModelInfo(
        provider=LLMProvider.ANTHROPIC,
        model_id="claude-3-opus-20240229",
        display_name="Claude 3 Opus",
        context_window=200000,
        max_output_tokens=4096,
        cost_per_1k_input=0.015,
        cost_per_1k_output=0.075,
        capabilities=[
            ModelCapability.CHAT,
            ModelCapability.VISION,
            ModelCapability.STREAMING
        ]
    ),
    "claude-3-sonnet": ModelInfo(
        provider=LLMProvider.ANTHROPIC,
        model_id="claude-3-sonnet-20240229",
        display_name="Claude 3 Sonnet",
        context_window=200000,
        max_output_tokens=4096,
        cost_per_1k_input=0.003,
        cost_per_1k_output=0.015,
        capabilities=[
            ModelCapability.CHAT,
            ModelCapability.VISION,
            ModelCapability.STREAMING
        ]
    ),
    "claude-3-haiku": ModelInfo(
        provider=LLMProvider.ANTHROPIC,
        model_id="claude-3-haiku-20240307",
        display_name="Claude 3 Haiku",
        context_window=200000,
        max_output_tokens=4096,
        cost_per_1k_input=0.00025,
        cost_per_1k_output=0.00125,
        capabilities=[
            ModelCapability.CHAT,
            ModelCapability.VISION,
            ModelCapability.STREAMING
        ]
    ),
}


@dataclass
class LLMConfig:
    """LLM router configuration"""
    primary_model: str = "gpt-4o"
    fallback_models: List[str] = field(default_factory=lambda: ["claude-3-sonnet", "gpt-3.5-turbo"])

    # API keys (from env by default)
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    azure_endpoint: Optional[str] = None
    azure_api_key: Optional[str] = None

    # Rate limiting
    max_requests_per_minute: int = 100
    max_tokens_per_minute: int = 100000

    # Retry settings
    max_retries: int = 3
    retry_delay: float = 1.0

    # Cost tracking
    track_costs: bool = True
    max_cost_per_request: float = 1.0  # USD

    # Caching
    cache_enabled: bool = True
    cache_ttl_seconds: int = 3600

    def __post_init__(self):
        if self.openai_api_key is None:
            self.openai_api_key = os.environ.get('OPENAI_API_KEY')
        if self.anthropic_api_key is None:
            self.anthropic_api_key = os.environ.get('ANTHROPIC_API_KEY')
        if self.azure_endpoint is None:
            self.azure_endpoint = os.environ.get('AZURE_OPENAI_ENDPOINT')
        if self.azure_api_key is None:
            self.azure_api_key = os.environ.get('AZURE_OPENAI_API_KEY')


# ═══════════════════════════════════════════════════════════════════════════
#                          REQUEST/RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class ChatMessage:
    """Chat message"""
    role: str  # system, user, assistant
    content: str
    name: Optional[str] = None
    images: Optional[List[str]] = None  # base64 or URLs for vision

    def to_dict(self) -> Dict[str, Any]:
        d = {"role": self.role, "content": self.content}
        if self.name:
            d["name"] = self.name
        return d


@dataclass
class LLMRequest:
    """Request to LLM"""
    messages: List[ChatMessage]
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    top_p: float = 1.0
    stop: Optional[List[str]] = None
    json_mode: bool = False
    stream: bool = False
    functions: Optional[List[Dict]] = None
    function_call: Optional[Union[str, Dict]] = None
    user: Optional[str] = None  # For rate limiting

    @property
    def cache_key(self) -> str:
        """Generate cache key for request"""
        content = json.dumps({
            "messages": [m.to_dict() for m in self.messages],
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "json_mode": self.json_mode
        }, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()[:32]


@dataclass
class LLMResponse:
    """Response from LLM"""
    content: str
    model: str
    provider: LLMProvider
    finish_reason: str
    usage: Dict[str, int]  # prompt_tokens, completion_tokens, total_tokens
    latency_ms: float
    cost_usd: float
    from_cache: bool = False
    function_call: Optional[Dict] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "content": self.content,
            "model": self.model,
            "provider": self.provider.value,
            "finish_reason": self.finish_reason,
            "usage": self.usage,
            "latency_ms": self.latency_ms,
            "cost_usd": self.cost_usd,
            "from_cache": self.from_cache
        }


# ═══════════════════════════════════════════════════════════════════════════
#                          PROVIDER CLIENTS
# ═══════════════════════════════════════════════════════════════════════════

class BaseLLMClient(ABC):
    """Base class for LLM provider clients"""

    @abstractmethod
    async def chat(self, request: LLMRequest, model_info: ModelInfo) -> LLMResponse:
        """Send chat request"""
        pass

    @abstractmethod
    async def stream_chat(
        self,
        request: LLMRequest,
        model_info: ModelInfo
    ) -> AsyncIterator[str]:
        """Stream chat response"""
        pass


class OpenAIClient(BaseLLMClient):
    """OpenAI API client"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from openai import AsyncOpenAI
                self._client = AsyncOpenAI(api_key=self.api_key)
            except ImportError:
                raise ImportError("openai package not installed")
        return self._client

    async def chat(self, request: LLMRequest, model_info: ModelInfo) -> LLMResponse:
        """Send chat request to OpenAI"""
        client = self._get_client()
        start_time = time.time()

        kwargs: Dict[str, Any] = {
            "model": model_info.model_id,
            "messages": [m.to_dict() for m in request.messages],
            "temperature": request.temperature,
            "top_p": request.top_p,
        }

        if request.max_tokens:
            kwargs["max_tokens"] = request.max_tokens
        if request.stop:
            kwargs["stop"] = request.stop
        if request.json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        if request.functions:
            kwargs["functions"] = request.functions
        if request.function_call:
            kwargs["function_call"] = request.function_call

        response = await client.chat.completions.create(**kwargs)

        latency = (time.time() - start_time) * 1000

        # Calculate cost
        usage = response.usage
        cost = (
            (usage.prompt_tokens / 1000 * model_info.cost_per_1k_input) +
            (usage.completion_tokens / 1000 * model_info.cost_per_1k_output)
        )

        return LLMResponse(
            content=response.choices[0].message.content or "",
            model=response.model,
            provider=LLMProvider.OPENAI,
            finish_reason=response.choices[0].finish_reason,
            usage={
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens
            },
            latency_ms=latency,
            cost_usd=cost,
            function_call=response.choices[0].message.function_call.__dict__ if response.choices[0].message.function_call else None
        )

    async def stream_chat(
        self,
        request: LLMRequest,
        model_info: ModelInfo
    ) -> AsyncIterator[str]:
        """Stream chat response"""
        client = self._get_client()

        kwargs: Dict[str, Any] = {
            "model": model_info.model_id,
            "messages": [m.to_dict() for m in request.messages],
            "temperature": request.temperature,
            "stream": True
        }

        if request.max_tokens:
            kwargs["max_tokens"] = request.max_tokens

        stream = await client.chat.completions.create(**kwargs)

        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


class AnthropicClient(BaseLLMClient):
    """Anthropic Claude API client"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from anthropic import AsyncAnthropic
                self._client = AsyncAnthropic(api_key=self.api_key)
            except ImportError:
                raise ImportError("anthropic package not installed")
        return self._client

    async def chat(self, request: LLMRequest, model_info: ModelInfo) -> LLMResponse:
        """Send chat request to Anthropic"""
        client = self._get_client()
        start_time = time.time()

        # Convert messages to Anthropic format
        system_message = None
        messages = []

        for msg in request.messages:
            if msg.role == "system":
                system_message = msg.content
            else:
                messages.append({
                    "role": msg.role,
                    "content": msg.content
                })

        kwargs: Dict[str, Any] = {
            "model": model_info.model_id,
            "messages": messages,
            "max_tokens": request.max_tokens or 4096,
        }

        if system_message:
            kwargs["system"] = system_message

        response = await client.messages.create(**kwargs)

        latency = (time.time() - start_time) * 1000

        # Calculate cost
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        cost = (
            (input_tokens / 1000 * model_info.cost_per_1k_input) +
            (output_tokens / 1000 * model_info.cost_per_1k_output)
        )

        return LLMResponse(
            content=response.content[0].text,
            model=response.model,
            provider=LLMProvider.ANTHROPIC,
            finish_reason=response.stop_reason,
            usage={
                "prompt_tokens": input_tokens,
                "completion_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens
            },
            latency_ms=latency,
            cost_usd=cost
        )

    async def stream_chat(
        self,
        request: LLMRequest,
        model_info: ModelInfo
    ) -> AsyncIterator[str]:
        """Stream chat response"""
        client = self._get_client()

        # Convert messages
        system_message = None
        messages = []

        for msg in request.messages:
            if msg.role == "system":
                system_message = msg.content
            else:
                messages.append({
                    "role": msg.role,
                    "content": msg.content
                })

        kwargs: Dict[str, Any] = {
            "model": model_info.model_id,
            "messages": messages,
            "max_tokens": request.max_tokens or 4096,
        }

        if system_message:
            kwargs["system"] = system_message

        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text


class MockLLMClient(BaseLLMClient):
    """Mock client for testing"""

    async def chat(self, request: LLMRequest, model_info: ModelInfo) -> LLMResponse:
        """Return mock response"""
        prompt_tokens = sum(len(m.content.split()) for m in request.messages)
        completion_tokens = 50

        return LLMResponse(
            content="[Mock response for testing]",
            model="mock-model",
            provider=LLMProvider.MOCK,
            finish_reason="stop",
            usage={
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens
            },
            latency_ms=100,
            cost_usd=0.0
        )

    async def stream_chat(
        self,
        request: LLMRequest,
        model_info: ModelInfo
    ) -> AsyncIterator[str]:
        """Stream mock response"""
        words = "[Mock streaming response for testing]".split()
        for word in words:
            await asyncio.sleep(0.05)
            yield word + " "


# ═══════════════════════════════════════════════════════════════════════════
#                          LLM ROUTER
# ═══════════════════════════════════════════════════════════════════════════

class LLMRouter:
    """
    Multi-provider LLM router with:
    - Automatic failover
    - Circuit breakers
    - Rate limiting
    - Cost tracking
    - Response caching
    """

    def __init__(self, config: Optional[LLMConfig] = None):
        self.config = config or LLMConfig()

        # Initialize clients
        self._clients: Dict[LLMProvider, BaseLLMClient] = {}
        self._initialize_clients()

        # Circuit breakers per provider
        self._circuit_breakers: Dict[LLMProvider, CircuitBreaker] = {
            provider: CircuitBreaker(failure_threshold=3, recovery_timeout=60)
            for provider in LLMProvider
        }

        # Rate limiting
        self._request_counts: Dict[str, List[float]] = {}  # model -> timestamps

        # Cache (simple in-memory)
        self._cache: Dict[str, Tuple[LLMResponse, float]] = {}  # key -> (response, timestamp)

        # Statistics
        self._stats = {
            "requests": 0,
            "tokens_used": 0,
            "cost_usd": 0.0,
            "cache_hits": 0,
            "fallbacks": 0,
            "errors": 0
        }

        logger.info(
            f"LLM Router initialized with primary={self.config.primary_model}, "
            f"fallbacks={self.config.fallback_models}"
        )

    def _initialize_clients(self) -> None:
        """Initialize LLM provider clients"""
        if self.config.openai_api_key:
            self._clients[LLMProvider.OPENAI] = OpenAIClient(self.config.openai_api_key)
            logger.info("OpenAI client initialized")

        if self.config.anthropic_api_key:
            self._clients[LLMProvider.ANTHROPIC] = AnthropicClient(self.config.anthropic_api_key)
            logger.info("Anthropic client initialized")

        # Always have mock available
        self._clients[LLMProvider.MOCK] = MockLLMClient()

    async def chat(
        self,
        request: LLMRequest,
        use_cache: bool = True
    ) -> LLMResponse:
        """
        Send chat request with automatic failover.

        Args:
            request: Chat request
            use_cache: Whether to use response cache

        Returns:
            LLM response
        """
        # Check cache
        if use_cache and self.config.cache_enabled:
            cached = self._check_cache(request)
            if cached:
                self._stats["cache_hits"] += 1
                return cached

        # Determine model to use
        model_name = request.model or self.config.primary_model
        models_to_try = [model_name] + self.config.fallback_models

        last_error = None

        for model in models_to_try:
            model_info = MODEL_REGISTRY.get(model)
            if not model_info:
                continue

            provider = model_info.provider
            client = self._clients.get(provider)

            if not client:
                continue

            circuit_breaker = self._circuit_breakers[provider]

            # Check circuit breaker
            if circuit_breaker.state == CircuitState.OPEN:
                logger.warning(f"Circuit breaker open for {provider.value}")
                continue

            # Check rate limit
            if not self._check_rate_limit(model):
                logger.warning(f"Rate limit exceeded for {model}")
                continue

            try:
                # Make request
                response = await client.chat(request, model_info)

                # Update stats
                self._stats["requests"] += 1
                self._stats["tokens_used"] += response.usage["total_tokens"]
                self._stats["cost_usd"] += response.cost_usd

                # Record success
                circuit_breaker.record_success()

                # Cache response
                if use_cache and self.config.cache_enabled:
                    self._cache_response(request, response)

                return response

            except Exception as e:
                logger.error(f"Request failed for {model}: {e}")
                circuit_breaker.record_failure()
                last_error = e
                self._stats["errors"] += 1

                if model != models_to_try[-1]:
                    self._stats["fallbacks"] += 1

        # All models failed
        if last_error:
            raise last_error
        raise Exception("No available LLM providers")

    async def stream_chat(
        self,
        request: LLMRequest
    ) -> AsyncIterator[str]:
        """
        Stream chat response.

        Args:
            request: Chat request

        Yields:
            Response text chunks
        """
        model_name = request.model or self.config.primary_model
        model_info = MODEL_REGISTRY.get(model_name)

        if not model_info:
            raise ValueError(f"Unknown model: {model_name}")

        client = self._clients.get(model_info.provider)
        if not client:
            raise ValueError(f"No client for provider: {model_info.provider.value}")

        async for chunk in client.stream_chat(request, model_info):
            yield chunk

    def _check_cache(self, request: LLMRequest) -> Optional[LLMResponse]:
        """Check if response is cached"""
        key = request.cache_key
        if key in self._cache:
            response, timestamp = self._cache[key]
            if time.time() - timestamp < self.config.cache_ttl_seconds:
                response.from_cache = True
                return response
            else:
                del self._cache[key]
        return None

    def _cache_response(self, request: LLMRequest, response: LLMResponse) -> None:
        """Cache response"""
        key = request.cache_key
        self._cache[key] = (response, time.time())

        # Evict old entries if too many
        if len(self._cache) > 1000:
            oldest_key = min(self._cache.items(), key=lambda x: x[1][1])[0]
            del self._cache[oldest_key]

    def _check_rate_limit(self, model: str) -> bool:
        """Check rate limit for model"""
        now = time.time()
        minute_ago = now - 60

        if model not in self._request_counts:
            self._request_counts[model] = []

        # Remove old timestamps
        self._request_counts[model] = [
            t for t in self._request_counts[model] if t > minute_ago
        ]

        if len(self._request_counts[model]) >= self.config.max_requests_per_minute:
            return False

        self._request_counts[model].append(now)
        return True

    def get_stats(self) -> Dict[str, Any]:
        """Get router statistics"""
        return {
            **self._stats,
            "cache_size": len(self._cache),
            "circuit_breakers": {
                p.value: cb.state.value
                for p, cb in self._circuit_breakers.items()
            }
        }

    def clear_cache(self) -> int:
        """Clear response cache"""
        count = len(self._cache)
        self._cache.clear()
        return count


# ═══════════════════════════════════════════════════════════════════════════
#                          SINGLETON INSTANCE
# ═══════════════════════════════════════════════════════════════════════════

_llm_router: Optional[LLMRouter] = None


def get_llm_router(config: Optional[LLMConfig] = None) -> LLMRouter:
    """Get or create LLM router singleton"""
    global _llm_router

    if _llm_router is None:
        _llm_router = LLMRouter(config)

    return _llm_router
