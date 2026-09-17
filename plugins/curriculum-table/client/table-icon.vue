<template>
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <rect class="paper" x="4" y="3" width="24" height="26" rx="4" />
    <path class="top" d="M4 9.5h24V7a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2.5Z" />
    <path class="line" d="M4 14h24M4 19h24M4 24h24M11 9.5V29M21 9.5V29" />
    <rect class="block green" x="12.2" y="14.8" width="8" height="3.4" rx="1" />
    <rect class="block blue" x="4.8" y="20" width="5.4" height="4" rx="1" />
    <rect class="block orange" x="22" y="14.8" width="5.4" height="9.2" rx="1" />
  </svg>
</template>

<style scoped>
svg {
  display: block;
  width: 28px;
  height: 28px;
}

.paper {
  fill: #ffffff;
  stroke: #285b50;
  stroke-width: 1.6;
}

.top {
  fill: #1b8b73;
}

.line {
  fill: none;
  stroke: #7b938c;
  stroke-width: 1.2;
}

.block.green {
  fill: #49b88e;
}

.block.blue {
  fill: #4f8fd8;
}

.block.orange {
  fill: #e4994e;
}
</style>
